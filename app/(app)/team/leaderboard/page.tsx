"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { statsBy } from "@/lib/metrics";
import { REPS, TEAMS } from "@/lib/mock";
import { fmtPct } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { useRange } from "@/components/range";

export default function Leaderboard() {
  const { allOrders, role, actor } = useStore();
  const { range, control } = useRange("week");
  const rows = useMemo(() => {
    const st = statsBy(allOrders, range, (o) => o.repId);
    return REPS.filter((r) => r.status === "active" || st.has(r.id))
      .filter((r) => role !== "manager" || r.managerId === actor.id)
      .map((r) => ({ rep: r, s: st.get(r.id) ?? { repId: r.id, submitted: 0, installed: 0, pending: 0, cancelled: 0, chargebacks: 0, activated: 0, activationRate: 0, attachRate: 0, perDay: 0 } }))
      .sort((a, b) => b.s.submitted - a.s.submitted || b.s.installed - a.s.installed);
  }, [allOrders, range, role, actor.id]);
  return (
    <>
      <PageHeader title="Leaderboard" sub={`${range.label} · ranked by sales submitted`} actions={control} />
      <div className="panel overflow-x-auto">
        <table className="tbl"><caption className="sr-only">Representative ranking</caption>
          <thead><tr><th className="r" style={{ width: 56 }}>Rank</th><th>Representative</th><th>Team</th><th className="r">Submitted</th><th className="r">Installed</th><th className="r">Pending</th><th className="r">Cancelled</th><th className="r">Activation %</th><th className="r">Attach %</th><th className="r">Commission</th></tr></thead>
          <tbody>{rows.map(({ rep, s }, i) => (
            <tr key={rep.id} data-selected={rep.id === actor.id}>
              <td className="r text-muted">{i + 1}</td>
              <td>{role === "rep" ? <span className="font-medium">{rep.name}{rep.id === actor.id ? " (you)" : ""}</span> : <Link className="rowlink" href={`/team/representatives/${rep.id}`}>{rep.name}</Link>}</td>
              <td className="text-muted">{TEAMS.find((t) => t.id === rep.teamId)?.name}</td>
              <td className="r font-medium">{s.submitted}</td><td className="r">{s.installed}</td><td className="r">{s.pending}</td><td className="r">{s.cancelled}</td>
              <td className="r">{s.submitted ? fmtPct(s.activationRate) : "—"}</td><td className="r">{s.submitted ? fmtPct(s.attachRate) : "—"}</td><td className="r text-faint">—</td>
            </tr>))}</tbody></table>
      </div>
      <p className="mt-3 text-[12px] text-faint">Activation % = orders submitted in range that reached Activated ÷ orders submitted. Attach % = orders with a mobile line ÷ orders submitted. Commission appears when the commission module is enabled.</p>
    </>
  );
}
