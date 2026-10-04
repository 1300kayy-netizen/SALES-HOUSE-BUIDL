"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { resolveRange, statsBy } from "@/lib/metrics";
import { REPS, TEAMS, userById } from "@/lib/mock";
import { fmtDateY, fmtPct } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { useRange } from "@/components/range";

export default function Team() {
  const { allOrders, role, actor } = useStore();
  const { range, control } = useRange("week");
  const [tab, setTab] = useState<"board" | "people">("board");
  const stats = useMemo(() => statsBy(allOrders, range, (o) => o.repId), [allOrders, range]);
  const mtd = useMemo(() => statsBy(allOrders, resolveRange("month"), (o) => o.repId), [allOrders]);
  const people = REPS.filter((r) => role === "admin" || role === "rep" || r.managerId === actor.id);
  const board = people.filter((r) => r.status === "active" || stats.has(r.id))
    .map((r) => ({ r, s: stats.get(r.id) }))
    .sort((a, b) => (b.s?.submitted ?? 0) - (a.s?.submitted ?? 0) || (b.s?.installed ?? 0) - (a.s?.installed ?? 0));
  const teamName = (id: string) => TEAMS.find((t) => t.id === id)?.name;

  return (
    <>
      <PageHeader title={role === "rep" ? "Leaderboard" : "Team"} sub={role === "rep" ? "How you compare this period." : `${people.filter((p) => p.status === "active").length} active reps`} actions={tab === "board" ? control : undefined} />
      {role !== "rep" && (
        <div role="tablist" className="mb-4 flex border-b border-line">
          <button role="tab" className="tab" aria-selected={tab === "board"} onClick={() => setTab("board")}>Leaderboard</button>
          <button role="tab" className="tab" aria-selected={tab === "people"} onClick={() => setTab("people")}>People</button>
        </div>)}

      {tab === "board" ? (
        <div className="panel overflow-x-auto">
          <table className="tbl"><caption className="sr-only">Representative ranking</caption>
            <thead><tr><th className="r" style={{ width: 52 }}>#</th><th>Rep</th><th className="max-sm:hidden">Team</th><th className="r">Submitted</th><th className="r">Installed</th><th className="r max-sm:hidden">Pending</th><th className="r max-sm:hidden">Cancelled</th><th className="r">Activation</th></tr></thead>
            <tbody>{board.map(({ r, s }, i) => (
              <tr key={r.id} data-selected={r.id === actor.id}>
                <td className="r text-faint">{i + 1}</td>
                <td>{role === "rep" ? <span className="font-medium">{r.name}{r.id === actor.id ? " · you" : ""}</span> : <Link className="rowlink" href={`/team/${r.id}`}>{r.name}</Link>}</td>
                <td className="text-muted max-sm:hidden">{teamName(r.teamId)}</td>
                <td className="r font-medium">{s?.submitted ?? 0}</td><td className="r">{s?.installed ?? 0}</td><td className="r max-sm:hidden">{s?.pending ?? 0}</td><td className="r max-sm:hidden">{s?.cancelled ?? 0}</td>
                <td className="r">{s?.submitted ? fmtPct(s.activationRate) : "—"}</td>
              </tr>))}</tbody></table>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="tbl"><thead><tr><th>Name</th><th>Team</th><th>Manager</th><th>Market</th><th>Status</th><th>Started</th><th className="r">Month</th></tr></thead>
            <tbody>{people.map((r) => (
              <tr key={r.id}><td><Link className="rowlink" href={`/team/${r.id}`}>{r.name}</Link></td><td>{teamName(r.teamId)}</td><td className="text-muted">{userById(r.managerId)?.name}</td><td className="text-muted">{r.market}</td>
                <td><span className="st" data-tone={r.status === "active" ? "success" : "neutral"}><i />{r.status === "active" ? "Active" : "Inactive"}</span></td><td className="text-muted">{fmtDateY(r.startDate)}</td><td className="r">{mtd.get(r.id)?.submitted ?? 0}</td></tr>))}</tbody></table>
        </div>)}
      <p className="mt-3 text-[12px] text-faint">Activation = share of orders submitted in the period that reached Activated.</p>
    </>
  );
}
