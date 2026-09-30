import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { activities, auditLogs, emailMessages, followUps, invoices } from "@/db/schema";
import { addDays, todayIso } from "@/lib/dates";
import type { AuthContext } from "@/server/auth/context";
import { generateDraft } from "@/server/ai/service";
import {
  EmailSendError,
  MockEmailProvider,
  SmtpEmailProvider,
  type EmailProvider,
  type OutgoingEmail,
} from "@/server/email/provider";
import { approveAndSend, updateDraft } from "@/server/email/send";
import { recordOutcome } from "@/server/invoices/outcomes";
import { resetRateLimits } from "@/server/rate-limit";
import { addUser, createInvoice, createOrg } from "../support/factories";

beforeEach(() => resetRateLimits());

const noSleep = async () => {};

/** Fails with the given errors in order, then succeeds. */
class FlakyProvider implements EmailProvider {
  readonly name = "flaky";
  calls = 0;
  constructor(private readonly failures: EmailSendError[]) {}
  async send() {
    this.calls += 1;
    const f = this.failures.shift();
    if (f) throw f;
    return { messageId: `<ok-${this.calls}@test>` };
  }
}

async function draftFor(ctx: AuthContext, p: Partial<Record<string, string>> = {}) {
  const invoiceId = await createInvoice(ctx, p);
  const { followUp } = await generateDraft(getDb(), ctx, invoiceId);
  return { invoiceId, followUp };
}

async function emailsFor(invoiceId: string) {
  return getDb().select().from(emailMessages).where(eq(emailMessages.invoiceId, invoiceId));
}

describe("approveAndSend", () => {
  it("sends the approved email and records everything", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await draftFor(owner, { customer_email: "ap@northwind.example" });
    const provider = new MockEmailProvider();
    const r = await approveAndSend(getDb(), owner, followUp.id, undefined, { provider });
    expect(r).toMatchObject({ ok: true, attempts: 1 });

    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: "ap@northwind.example", subject: followUp.subject, text: followUp.body, replyTo: owner.email });

    const [msg] = await emailsFor(invoiceId);
    expect(msg).toMatchObject({
      status: "sent",
      recipient: "ap@northwind.example",
      subject: followUp.subject,
      body: followUp.body,
      userId: owner.userId,
      invoiceId,
      attempts: 1,
    });
    expect(msg!.sentAt).toBeInstanceOf(Date);

    const [fu] = await getDb().select().from(followUps).where(eq(followUps.id, followUp.id));
    expect(fu).toMatchObject({ status: "sent", approvedBy: owner.userId });

    const [inv] = await getDb().select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.followUpCount).toBe(1);
    expect(inv!.lastContactAt).toBeInstanceOf(Date);
    expect(inv!.nextFollowUpDate).toBe(addDays(todayIso(), 7));

    const acts = await getDb().select().from(activities).where(eq(activities.invoiceId, invoiceId));
    expect(acts.some((a) => a.type === "reminder_sent" && a.summary.includes("ap@northwind.example"))).toBe(true);
    const audits = await getDb().select().from(auditLogs).where(eq(auditLogs.targetId, msg!.id));
    expect(audits.map((a) => a.action).sort()).toEqual(["email.approved", "email.sent"]);
  });

  it("sends exactly what the user edited and records the edit", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await draftFor(owner, { invoice_number: "INV-8001" });
    const provider = new MockEmailProvider();
    const edited = { subject: "Invoice INV-8001 – quick question", body: "Hi Sam,\n\nCould you confirm when INV-8001 will be paid?\n\nThanks" };
    await approveAndSend(getDb(), owner, followUp.id, edited, { provider });
    expect(provider.sent[0]).toMatchObject({ subject: edited.subject, text: edited.body });
    const acts = await getDb().select().from(activities).where(eq(activities.invoiceId, invoiceId));
    expect(acts.some((a) => a.type === "reminder_edited")).toBe(true);
  });

  it("never lets the form change the recipient or inject headers", async () => {
    const owner = await createOrg();
    const { followUp } = await draftFor(owner, { customer_email: "ap@northwind.example" });
    const provider = new MockEmailProvider();
    await approveAndSend(
      getDb(),
      owner,
      followUp.id,
      { subject: "Hi\r\nBcc: attacker@evil.example", body: "Body for invoice", to: "attacker@evil.example" },
      { provider },
    );
    expect(provider.sent[0]!.to).toBe("ap@northwind.example");
    expect(provider.sent[0]!.subject).not.toMatch(/[\r\n]/);
  });

  it("does not retry permanent failures and records the failure", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await draftFor(owner);
    const provider = new FlakyProvider([new EmailSendError("The mail server rejected the recipient address.", true)]);
    const r = await approveAndSend(getDb(), owner, followUp.id, undefined, { provider, sleep: noSleep });
    expect(r).toMatchObject({ ok: false, attempts: 1, error: "The mail server rejected the recipient address." });
    expect(provider.calls).toBe(1);
    const [msg] = await emailsFor(invoiceId);
    expect(msg).toMatchObject({ status: "failed", attempts: 1, sentAt: null });
    const [fu] = await getDb().select().from(followUps).where(eq(followUps.id, followUp.id));
    expect(fu!.status).toBe("failed");
    const [inv] = await getDb().select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.followUpCount).toBe(0);
    const acts = await getDb().select().from(activities).where(and(eq(activities.invoiceId, invoiceId), eq(activities.type, "reminder_failed")));
    expect(acts).toHaveLength(1);
  });

  it("retries transient failures with backoff and succeeds", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await draftFor(owner);
    const waits: number[] = [];
    const provider = new FlakyProvider([new EmailSendError("Temporary mail server error (SMTP 421).", false)]);
    const r = await approveAndSend(getDb(), owner, followUp.id, undefined, {
      provider,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    expect(waits).toEqual([500]);
    expect((await emailsFor(invoiceId))[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("gives up after 3 transient failures, then a manual retry sends once", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await draftFor(owner);
    const transient = () => new EmailSendError("Could not reach the mail server.", false);
    const provider = new FlakyProvider([transient(), transient(), transient()]);
    const r = await approveAndSend(getDb(), owner, followUp.id, undefined, { provider, sleep: noSleep });
    expect(r).toMatchObject({ ok: false, attempts: 3 });

    const retry = await approveAndSend(getDb(), owner, followUp.id, undefined, { provider, sleep: noSleep });
    expect(retry).toMatchObject({ ok: true, attempts: 1 });
    expect(provider.calls).toBe(4);
    const msgs = await emailsFor(invoiceId);
    expect(msgs.map((m) => m.status).sort()).toEqual(["failed", "sent"]);
  });

  it("refuses an invalid recipient without contacting the mail server", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await draftFor(owner);
    await getDb().update(invoices).set({ customerEmail: "not an email" }).where(eq(invoices.id, invoiceId));
    const provider = new FlakyProvider([]);
    const r = await approveAndSend(getDb(), owner, followUp.id, undefined, { provider, sleep: noSleep });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/email address is invalid/);
    expect(provider.calls).toBe(0);
  });

  it("prevents sending the same draft twice", async () => {
    const owner = await createOrg();
    const { followUp } = await draftFor(owner);
    const provider = new MockEmailProvider();
    await approveAndSend(getDb(), owner, followUp.id, undefined, { provider });
    await expect(approveAndSend(getDb(), owner, followUp.id, undefined, { provider })).rejects.toThrow("already been sent");
    expect(provider.sent).toHaveLength(1);
  });

  it("sends only once when Approve & Send is clicked twice concurrently", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await draftFor(owner);
    let calls = 0;
    const slow: EmailProvider = {
      name: "slow",
      async send() {
        calls += 1;
        await new Promise((r) => setTimeout(r, 100));
        return { messageId: "<slow@test>" };
      },
    };
    const results = await Promise.allSettled([
      approveAndSend(getDb(), owner, followUp.id, undefined, { provider: slow }),
      approveAndSend(getDb(), owner, followUp.id, undefined, { provider: slow }),
      approveAndSend(getDb(), owner, followUp.id, undefined, { provider: slow }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(calls).toBe(1);
    expect((await emailsFor(invoiceId)).filter((m) => m.status === "sent")).toHaveLength(1);
  });

  it("blocks a second reminder for the same invoice within 24 hours", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await draftFor(owner);
    const provider = new MockEmailProvider();
    await approveAndSend(getDb(), owner, followUp.id, undefined, { provider });
    const { followUp: second } = await generateDraft(getDb(), owner, invoiceId);
    await expect(approveAndSend(getDb(), owner, second.id, undefined, { provider })).rejects.toThrow("last 24 hours");
    const later = new Date(Date.now() + 25 * 3_600_000);
    await expect(approveAndSend(getDb(), owner, second.id, undefined, { provider, now: later })).resolves.toMatchObject({ ok: true });
    expect(provider.sent).toHaveLength(2);
  });

  it("refuses to send for a paid invoice", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await draftFor(owner);
    await recordOutcome(getDb(), owner, invoiceId, { type: "paid" });
    // Marking paid discards the draft.
    await expect(approveAndSend(getDb(), owner, followUp.id, undefined, { provider: new MockEmailProvider() })).rejects.toThrow();
  });
});

describe("interrupted sends", () => {
  async function stuck(ctx: AuthContext, minutesAgo: number) {
    const { invoiceId, followUp } = await draftFor(ctx);
    const at = new Date(Date.now() - minutesAgo * 60_000);
    await getDb().update(followUps).set({ status: "sending", updatedAt: at }).where(eq(followUps.id, followUp.id));
    await getDb().insert(emailMessages).values({
      organizationId: ctx.orgId,
      invoiceId,
      followUpId: followUp.id,
      userId: ctx.userId,
      recipient: "ap@northwind.example",
      subject: followUp.subject,
      body: followUp.body,
      status: "sending",
      provider: "mock",
      createdAt: at,
    });
    return { invoiceId, followUp };
  }

  it("blocks a retry while a send is still in progress", async () => {
    const owner = await createOrg();
    const { followUp } = await stuck(owner, 1);
    const provider = new MockEmailProvider();
    await expect(approveAndSend(getDb(), owner, followUp.id, undefined, { provider })).rejects.toThrow("already being sent");
    expect(provider.sent).toHaveLength(0);
  });

  it("lets a human retry an interrupted send, recording the unknown delivery", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await stuck(owner, 30);
    const provider = new MockEmailProvider();
    await expect(approveAndSend(getDb(), owner, followUp.id, undefined, { provider })).resolves.toMatchObject({ ok: true });
    expect(provider.sent).toHaveLength(1);
    const msgs = await emailsFor(invoiceId);
    expect(msgs.map((m) => m.status).sort()).toEqual(["failed", "sent"]);
    expect(msgs.find((m) => m.status === "failed")!.error).toMatch(/interrupted/);
    const acts = await getDb().select().from(activities).where(and(eq(activities.invoiceId, invoiceId), eq(activities.type, "reminder_failed")));
    expect(acts).toHaveLength(1);
  });

  it("redrafting releases an interrupted send instead of blocking forever", async () => {
    const owner = await createOrg();
    const { invoiceId, followUp } = await stuck(owner, 30);
    const { followUp: fresh } = await generateDraft(getDb(), owner, invoiceId);
    const [old] = await getDb().select().from(followUps).where(eq(followUps.id, followUp.id));
    expect(old!.status).toBe("discarded");
    await expect(approveAndSend(getDb(), owner, fresh.id, undefined, { provider: new MockEmailProvider() })).resolves.toMatchObject({ ok: true });
  });
});

describe("email permissions", () => {
  it("viewers cannot send or edit, and nothing is sent", async () => {
    const owner = await createOrg();
    const viewer = await addUser(owner, "viewer");
    const { followUp } = await draftFor(owner);
    const provider = new MockEmailProvider();
    await expect(approveAndSend(getDb(), viewer, followUp.id, undefined, { provider })).rejects.toThrow("permission");
    await expect(updateDraft(getDb(), viewer, followUp.id, { subject: "x", body: "y" })).rejects.toThrow("permission");
    expect(provider.sent).toHaveLength(0);
  });

  it("members can send", async () => {
    const owner = await createOrg();
    const member = await addUser(owner, "member");
    const { followUp } = await draftFor(owner);
    await expect(approveAndSend(getDb(), member, followUp.id, undefined, { provider: new MockEmailProvider() })).resolves.toMatchObject({ ok: true });
  });

  it("another organization cannot send, edit or even see the draft", async () => {
    const owner = await createOrg();
    const intruder = await createOrg("Intruder");
    const { followUp } = await draftFor(owner);
    const provider = new MockEmailProvider();
    await expect(approveAndSend(getDb(), intruder, followUp.id, undefined, { provider })).rejects.toThrow("Draft not found");
    await expect(updateDraft(getDb(), intruder, followUp.id, { subject: "x", body: "y" })).rejects.toThrow("Draft not found");
    expect(provider.sent).toHaveLength(0);
  });
});

describe("SMTP provider (local test server, no external delivery)", () => {
  let server: SMTPServer;
  let port: number;
  const received: { from: string; to: string[]; raw: string }[] = [];
  let mode: "ok" | "reject_rcpt" | "temp_fail" = "ok";

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: false,
      allowInsecureAuth: true,
      disabledCommands: ["STARTTLS"],
      logger: false,
      onAuth(auth, _session, cb) {
        if (auth.username === "cashpilot" && auth.password === "smtp-secret") return cb(null, { user: "cashpilot" });
        return cb(Object.assign(new Error("Invalid credentials"), { responseCode: 535 }));
      },
      onRcptTo(address, _session, cb) {
        if (mode === "reject_rcpt") return cb(Object.assign(new Error("No such user"), { responseCode: 550 }));
        if (mode === "temp_fail") return cb(Object.assign(new Error("Try again later"), { responseCode: 421 }));
        cb();
        void address;
      },
      onData(stream, session, cb) {
        let raw = "";
        stream.on("data", (c: Buffer) => (raw += c.toString()));
        stream.on("end", () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
            to: session.envelope.rcptTo.map((r) => r.address),
            raw,
          });
          cb();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const provider = (password = "smtp-secret") =>
    new SmtpEmailProvider({ host: "127.0.0.1", port, secure: false, user: "cashpilot", password, allowInsecure: true });

  const email: OutgoingEmail = {
    from: "Brightline AR <billing@brightline.example>",
    to: "ap@northwind.example",
    replyTo: "olivia@brightline.example",
    subject: "Invoice INV-2041 – payment reminder",
    text: "Hello,\n\nA reminder about invoice INV-2041.\n\nKind regards",
  };

  it("delivers a plain-text message with authentication", async () => {
    mode = "ok";
    const r = await provider().send(email);
    expect(r.messageId).toBeTruthy();
    const msg = received.at(-1)!;
    expect(msg.to).toEqual(["ap@northwind.example"]);
    expect(msg.raw).toMatch(/Subject: .*INV-2041/); // non-ASCII subjects are MIME-encoded
    expect(msg.raw).toMatch(/Reply-To: olivia@brightline.example/);
    expect(msg.raw).toMatch(/Content-Type: text\/plain/);
    expect(msg.raw).not.toMatch(/text\/html/);
  });

  it("classifies a rejected recipient as permanent", async () => {
    mode = "reject_rcpt";
    await expect(provider().send(email)).rejects.toMatchObject({ permanent: true });
  });

  it("classifies a 4xx response as transient", async () => {
    mode = "temp_fail";
    await expect(provider().send(email)).rejects.toMatchObject({ permanent: false });
  });

  it("classifies bad credentials as permanent", async () => {
    mode = "ok";
    await expect(provider("wrong").send(email)).rejects.toMatchObject({ permanent: true, message: expect.stringMatching(/authentication/) });
  });

  it("classifies an unreachable server as transient", async () => {
    const dead = new SmtpEmailProvider({ host: "127.0.0.1", port: 1, secure: false, allowInsecure: true });
    await expect(dead.send(email)).rejects.toMatchObject({ permanent: false });
  });
});
