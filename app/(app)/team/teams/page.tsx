"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { resolveRange, statsBy } from "@/lib/metrics";
import { REPS, TEAMS, userById } from "@/lib/mock";
import { fmtPct } from "@/lib/format";
import { PageHeader, useToast } from "@/components/ui";

export default function Teams() {
  const { allOrders, role, actor } = useStore();
  const toast = useToast();
  const st = useMemo(() => statsBy(allOrders, resolveRange("month"), (o) => o.teamId), [allOrders]);
  const teams = TEAMS.filter((t) => role === "admin" || t.managerId === actor.id);
  return (
    <>
      <PageHeader title="Teams" sub="Membership is effective-dated so history stays attributed to the team at the time." actions={role === "admin" ? <button className="btn" onClick={() => toast("Team management arrives in Phase 2", "err")}>New team</button> : undefined} />
      <div className="space-y-4">
        {teams.map((t) => { const s = st.get(t.id); const members = REPS.filter((r) => r.teamId === t.id); return (
          <section key={t.id} className="panel">
            <div className="panel-h"><h2>{t.name}</h2><span className="text-[12px] text-muted">{t.market} · Manager {userById(t.managerId)?.name}</span></div>
            <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4 [&>*]:border-r [&>*]:border-line">
              {[["Members", members.filter((m) => m.status === "active").length], ["Submitted (MTD)", s?.submitted ?? 0], ["Installed (MTD)", s?.installed ?? 0], ["Activation %", s?.submitted ? fmtPct(s.activationRate) : "—"]].map(([k, v]) => <div key={k as string} className="px-4 py-3"><div className="eyebrow">{k}</div><div className="text-lg font-semibold tabular-nums">{v}</div></div>)}
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-4">{members.map((m) => <li key={m.id} className={m.status === "inactive" ? "text-faint" : ""}>{m.name}{m.status === "inactive" ? " (inactive)" : ""}</li>)}</ul>
          </section>); })}
      </div>
    </>
  );
}
