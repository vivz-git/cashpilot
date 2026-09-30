import { and, eq, inArray, lt } from "drizzle-orm";
import type { Database } from "@/db";
import { emailMessages, followUps } from "@/db/schema";
import { recordActivity } from "../activities";
import { audit } from "../audit";
import type { AuthContext } from "../auth/context";

/** A send that has not finished after this long was interrupted (e.g. a server restart). */
export const STALE_SENDING_MS = 15 * 60_000;

export const INTERRUPTED_MESSAGE =
  "The send was interrupted and delivery could not be confirmed. Check your sent mail before retrying.";

export function isStaleSending(f: { status: string; updatedAt: Date }, now: Date = new Date()): boolean {
  return f.status === "sending" && f.updatedAt.getTime() < now.getTime() - STALE_SENDING_MS;
}

/**
 * Marks interrupted sends for an invoice as failed so a human can decide to
 * retry. Never resends anything by itself.
 */
export async function releaseStaleSends(
  db: Database,
  ctx: AuthContext,
  invoiceId: string,
  now: Date = new Date(),
): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
  return db.transaction(async (tx) => {
    const released = await tx
      .update(followUps)
      .set({ status: "failed", updatedAt: now })
      .where(
        and(
          eq(followUps.organizationId, ctx.orgId),
          eq(followUps.invoiceId, invoiceId),
          eq(followUps.status, "sending"),
          lt(followUps.updatedAt, staleBefore),
        ),
      )
      .returning({ id: followUps.id });
    if (released.length === 0) return 0;
    const ids = released.map((r) => r.id);
    await tx
      .update(emailMessages)
      .set({ status: "failed", error: INTERRUPTED_MESSAGE })
      .where(
        and(
          eq(emailMessages.organizationId, ctx.orgId),
          inArray(emailMessages.followUpId, ids),
          eq(emailMessages.status, "sending"),
        ),
      );
    for (const id of ids) {
      await recordActivity(tx, {
        orgId: ctx.orgId,
        invoiceId,
        actorUserId: ctx.userId,
        type: "reminder_failed",
        summary: `Reminder send was interrupted; delivery unknown. ${INTERRUPTED_MESSAGE}`,
        metadata: { followUpId: id, interrupted: true },
      });
      await audit(tx, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        action: "email.interrupted",
        targetType: "follow_up",
        targetId: id,
      });
    }
    return ids.length;
  });
}
