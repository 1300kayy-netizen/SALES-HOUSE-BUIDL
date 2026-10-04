"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { resolveRange, statsBy } from "@/lib/metrics";
import { REPS, TEAMS, userById } from "@/lib/mock";
import { fmtDateY, fmtPct } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export default function Representatives() {
  const { allOrders, role, actor } = useStore();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const stats = useMemo(() => statsBy(allOrders, resolveRange("month"), (o) => o.repId), [allOrders]);
  const rows = REPS.filter((r) => (role === "admin" || r.managerId === actor.id) && (!team || r.teamId === team) && r.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="Representatives" sub={`${rows.length} representatives`} actions={role === "admin" ? <button className="btn" disabled title="Rep management arrives in Phase 2">Invite rep</button> : undefined} />
      <div className="panel">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <label className="sr-only" htmlFor="rq">Search reps</label><input id="rq" className="input input-sm w-64" placeholder="Search representatives…" value={q} onChange={(e) => setQ(e.target.value)} />
          {role === "admin" && <select aria-label="Team" className="input input-sm w-auto" value={team} onChange={(e) => setTeam(e.target.value)}><option value="">All teams</option>{TEAMS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        </div>
        <div className="overflow-x-auto">
          <table className="tbl"><thead><tr><th>Name</th><th>Team</th><th>Manager</th><th>Market</th><th>Status</th><th>Start date</th><th className="r">Submitted (MTD)</th><th className="r">Activation %</th></tr></thead>
            <tbody>{rows.map((r) => { const s = stats.get(r.id); return (
              <tr key={r.id}><td><Link className="rowlink" href={`/team/representatives/${r.id}`}>{r.name}</Link></td><td>{TEAMS.find((t) => t.id === r.teamId)?.name}</td><td>{userById(r.managerId)?.name}</td><td>{r.market}</td>
                <td><span className="st" data-tone={r.status === "active" ? "success" : "neutral"}><i />{r.status === "active" ? "Active" : "Inactive"}</span></td>
                <td className="text-muted">{fmtDateY(r.startDate)}</td><td className="r">{s?.submitted ?? 0}</td><td className="r">{s?.submitted ? fmtPct(s.activationRate) : "—"}</td></tr>); })}</tbody></table>
        </div>
      </div>
    </>
  );
}
