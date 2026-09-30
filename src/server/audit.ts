import type { Database } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(
  db: Pick<Database, "insert">,
  entry: {
    orgId: string | null;
    userId: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    organizationId: entry.orgId,
    userId: entry.userId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ?? {},
  });
}
