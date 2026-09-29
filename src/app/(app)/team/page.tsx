import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "@/components/ui";
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
    <div className="max-w-3xl space-y-8">
      <PageHeader title="Team" description={session.organization.name} />
      <Card title={`Members (${team.length})`} description="Owners manage the team. Members can import, analyze, draft and send. Viewers can only read." flush>
        <ul className="divide-y divide-slate-100 text-sm">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600" aria-hidden="true">
                  {m.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{m.name}</p>
                  <p className="truncate text-slate-500">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={m.role === "owner" ? "violet" : m.role === "member" ? "blue" : "gray"} title={ROLE_HELP[m.role]}>{m.role}</Badge>
                <span className="text-xs text-slate-500">since {formatDate(m.createdAt.toISOString())}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {can(session.ctx, "manage_team") && (
        <Card title="Add teammate" description="Share the initial password with them securely.">
          <AddMemberForm />
        </Card>
      )}
    </div>
  );
}
