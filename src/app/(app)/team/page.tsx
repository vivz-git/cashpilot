import type { Metadata } from "next";
import { Badge, Card } from "@/components/ui";
import { getDb } from "@/db";
import { formatDate } from "@/lib/dates";
import { can } from "@/server/auth/context";
import { requireSession } from "@/server/auth/session";
import { listTeam } from "@/server/auth/service";
import { AddMemberForm } from "./add-member-form";

export const metadata: Metadata = { title: "Team" };

const ROLE_HELP = {
  owner: "Full access, manages team",
  member: "Import, analyze, draft and send",
  viewer: "Read-only",
} as const;

export default async function TeamPage() {
  const session = await requireSession();
  const team = await listTeam(getDb(), session.ctx);
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="text-sm text-slate-500">{session.organization.name}</p>
      </div>
      <Card title="Members">
        <ul className="divide-y divide-slate-100 text-sm">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium text-slate-900">{m.name}</p>
                <p className="text-slate-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === "owner" ? "violet" : m.role === "member" ? "blue" : "gray"} title={ROLE_HELP[m.role]}>{m.role}</Badge>
                <span className="text-xs text-slate-500">since {formatDate(m.createdAt.toISOString())}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {can(session.ctx, "manage_team") && (
        <Card title="Add teammate">
          <AddMemberForm />
        </Card>
      )}
    </div>
  );
}
