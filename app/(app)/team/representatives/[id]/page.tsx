"use client";
import Link from "next/link";
import { use, useMemo } from "react";
import { useStore } from "@/lib/store";
import { statsBy, resolveRange } from "@/lib/metrics";
import { DAY, NOW, TEAMS, pkgById, startOfDay, userById } from "@/lib/mock";
import { fmtDateTime, fmtDateY, fmtPct } from "@/lib/format";
import { EmptyState, PageHeader, Status } from "@/components/ui";
import { MiniBars } from "@/components/charts";
import { useRange } from "@/components/range";

export default function RepProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { allOrders, role, actor } = useStore();
  const { range, control } = useRange("month", ["week", "month", "custom"]);
  const rep = userById(id);
  const mine = useMemo(() => allOrders.filter((o) => o.repId === id), [allOrders, id]);
  const s = useMemo(() => statsBy(mine, range, (o) => o.repId).get(id), [mine, range, id]);
  const weeks = useMemo(() => {
    const cur = resolveRange("week").start;
    return Array.from({ length: 8 }, (_, i) => {
      const start = cur - (7 - i) * 7 * DAY;
      return { label: i === 7 ? "This" : `-${7 - i}w`, value: mine.filter((o) => o.submittedAt >= start && o.submittedAt < start + 7 * DAY).length };
    });
  }, [mine]);
  const months = useMemo(() => [2, 1, 0].map((k) => {
    const d = new Date(startOfDay(NOW) + 12 * 3600_000); const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1) + 4 * 3600_000; const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k + 1, 1) + 4 * 3600_000;
    return { label: new Date(first + 12 * 3600_000).toLocaleString("en-US", { month: "short", timeZone: "UTC" }), value: mine.filter((o) => o.submittedAt >= first && o.submittedAt < next).length };
  }), [mine]);

  const visible = rep && (role === "admin" || (role === "manager" && rep.managerId === actor.id) || (role === "rep" && rep.id === actor.id));
  if (!rep || !visible) return <div className="panel"><EmptyState title="Representative not found" action={<Link href="/team/representatives" className="btn btn-sm no-underline">Back</Link>} /></div>;
  const team = TEAMS.find((t) => t.id === rep.teamId);
  const m: [string, string][] = [
    ["Submitted", String(s?.submitted ?? 0)], ["Installed", String(s?.installed ?? 0)], ["Pending", String(s?.pending ?? 0)], ["Cancelled", String(s?.cancelled ?? 0)],
    ["Chargebacks", String(s?.chargebacks ?? 0)], ["Activation %", s?.submitted ? fmtPct(s.activationRate) : "—"], ["Mobile attach %", s?.submitted ? fmtPct(s.attachRate) : "—"], ["Avg sales / day", (s?.perDay ?? 0).toFixed(1)],
  ];
  return (
    <>
      <PageHeader title={rep.name} sub={`${rep.role === "rep" ? "Sales Representative" : rep.role} · ${team?.name} team`} actions={control} />
      <div className="panel mb-4">
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          {[["Team", team?.name], ["Manager", userById(rep.managerId)?.name], ["Market", rep.market], ["Status", rep.status === "active" ? "Active" : "Inactive"], ["Start date", fmtDateY(rep.startDate)], ["Email", rep.email]].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="eyebrow">{k}</dt><dd className="m-0 truncate">{v}</dd></div>))}
        </dl>
      </div>
      <div className="panel mb-4 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 [&>*]:border-b [&>*]:border-r [&>*]:border-line">
        {m.map(([k, v]) => <div key={k} className="px-4 py-3"><div className="eyebrow">{k}</div><div className="text-[22px] font-semibold leading-7 tabular-nums">{v}</div></div>)}
      </div>
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <section className="panel"><div className="panel-h"><h2>Weekly performance</h2><span className="text-[12px] text-muted">Last 8 weeks · submitted</span></div><div className="p-4"><MiniBars data={weeks} label="Sales submitted per week" /></div></section>
        <section className="panel"><div className="panel-h"><h2>Monthly performance</h2><span className="text-[12px] text-muted">Last 3 months · submitted</span></div><div className="p-4"><MiniBars data={months} label="Sales submitted per month" /></div></section>
      </div>
      <section className="panel">
        <div className="panel-h"><h2>Order history</h2><Link className="text-[12px] text-brand" href="/orders">All orders</Link></div>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Order</th><th>Submitted</th><th>Customer</th><th>Package</th><th>Status</th></tr></thead>
          <tbody>{mine.slice(0, 15).map((o) => <tr key={o.id}><td><Link className="rowlink mono" href={`/orders/${o.no}`}>{o.no}</Link></td><td className="text-muted">{fmtDateTime(o.submittedAt)}</td><td>{o.customer.name}</td><td>{pkgById(o.packageId).name}</td><td><Status o={o} /></td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}
