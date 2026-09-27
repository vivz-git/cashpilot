import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export interface OutgoingEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  /** Plain text only. HTML emails are never sent. */
  text: string;
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    /** Permanent errors (rejected recipient, auth failure) are not retried. */
    public readonly permanent: boolean,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

export interface EmailProvider {
  readonly name: string;
  send(email: OutgoingEmail): Promise<{ messageId: string }>;
}

/** Records emails in memory. Never delivers anything. Default in development and tests. */
export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";
  readonly sent: (OutgoingEmail & { messageId: string })[] = [];

  async send(email: OutgoingEmail) {
    const messageId = `<mock-${Date.now()}-${this.sent.length}@cashpilot.local>`;
    this.sent.push({ ...email, messageId });
    return { messageId };
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  /** Only for local test servers. Production must use TLS. */
  allowInsecure?: boolean;
}

/** Authenticated SMTP via nodemailer. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private readonly transport: Transporter;

  constructor(config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure && !config.allowInsecure,
      ignoreTLS: Boolean(config.allowInsecure),
      auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(email: OutgoingEmail) {
    try {
      const info = await this.transport.sendMail({
        from: email.from,
        to: email.to,
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.text,
        // Recipients come from our database, but keep nodemailer from reading files/URLs as content.
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      if (info.rejected && info.rejected.length > 0) {
        throw new EmailSendError("The mail server rejected the recipient address.", true);
      }
      return { messageId: String(info.messageId ?? "") };
    } catch (err) {
      if (err instanceof EmailSendError) throw err;
      throw classifySmtpError(err);
    }
  }
}

export function classifySmtpError(err: unknown): EmailSendError {
  const e = err as { responseCode?: number; code?: string; message?: string };
  const code = e.responseCode;
  if (typeof code === "number") {
    if (code >= 500) {
      const what =
        code === 535 || e.code === "EAUTH"
          ? "SMTP authentication failed. Check the SMTP credentials."
          : code === 550 || code === 553 || code === 501
            ? "The mail server rejected the recipient address."
            : `The mail server refused the message (SMTP ${code}).`;
      return new EmailSendError(what, true);
    }
    return new EmailSendError(`Temporary mail server error (SMTP ${code}).`, false);
  }
  if (e.code === "EAUTH") return new EmailSendError("SMTP authentication failed. Check the SMTP credentials.", true);
  if (e.code === "EENVELOPE") return new EmailSendError("The recipient address was rejected.", true);
  return new EmailSendError("Could not reach the mail server.", false);
}

let override: EmailProvider | null = null;
let mockSingleton: MockEmailProvider | null = null;

export function setEmailProviderForTesting(provider: EmailProvider | null): void {
  override = provider;
}

export function getEmailProvider(): EmailProvider {
  if (override) return override;
  if (process.env.EMAIL_PROVIDER === "smtp") {
    const host = process.env.SMTP_HOST;
    if (!host) throw new Error("EMAIL_PROVIDER=smtp but SMTP_HOST is not set");
    return new SmtpEmailProvider({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER || undefined,
      password: process.env.SMTP_PASSWORD || undefined,
      allowInsecure: process.env.NODE_ENV !== "production" && process.env.SMTP_ALLOW_INSECURE === "true",
    });
  }
  mockSingleton ??= new MockEmailProvider();
  return mockSingleton;
}

export function emailFromAddress(): string {
  return process.env.EMAIL_FROM || "Accounts Receivable <billing@example.com>";
}
