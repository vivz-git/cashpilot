import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { activities, users, type ActivitySource, type ActivityType } from "@/db/schema";
import { requirePermission, type AuthContext } from "./auth/context";

type Tx = Pick<Database, "insert">;

export async function recordActivity(
  tx: Tx,
  entry: {
    orgId: string;
    invoiceId: string;
    actorUserId: string | null;
    type: ActivityType;
    source?: ActivitySource;
    summary: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(activities).values({
    organizationId: entry.orgId,
    invoiceId: entry.invoiceId,
    actorUserId: entry.actorUserId,
    type: entry.type,
    source: entry.source ?? "system",
    summary: entry.summary,
    metadata: entry.metadata ?? {},
  });
}

export async function listTimeline(db: Database, ctx: AuthContext, invoiceId: string) {
  requirePermission(ctx, "read");
  return db
    .select({
      id: activities.id,
      type: activities.type,
      source: activities.source,
      summary: activities.summary,
      metadata: activities.metadata,
      createdAt: activities.createdAt,
      actorName: users.name,
    })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorUserId))
    .where(and(eq(activities.organizationId, ctx.orgId), eq(activities.invoiceId, invoiceId)))
    .orderBy(desc(activities.createdAt), desc(activities.id));
}
