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
  const { range, control } = useRange("month", ["week", "month"]);
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
  if (!rep || !visible) return <div className="panel"><EmptyState title="Representative not found" action={<Link href="/team" className="btn btn-sm no-underline">Back to team</Link>} /></div>;
  const team = TEAMS.find((t) => t.id === rep.teamId);
  const m: [string, string][] = [
    ["Submitted", String(s?.submitted ?? 0)], ["Installed", String(s?.installed ?? 0)], ["Pending", String(s?.pending ?? 0)], ["Cancelled", String(s?.cancelled ?? 0)],
    ["Chargebacks", String(s?.chargebacks ?? 0)], ["Activation %", s?.submitted ? fmtPct(s.activationRate) : "—"], ["Mobile attach %", s?.submitted ? fmtPct(s.attachRate) : "—"], ["Avg sales / day", (s?.perDay ?? 0).toFixed(1)],
  ];
  return (
    <>
      <Link href="/team" className="text-[13px] text-muted no-underline hover:text-ink">← Team</Link>
      <div className="mt-2" />
      <PageHeader title={rep.name} sub={`${team?.name} team · ${rep.market} · Manager ${userById(rep.managerId)?.name} · Started ${fmtDateY(rep.startDate)}`} actions={control} />
      <div className="panel mb-4 grid grid-cols-2 sm:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-line">
        {m.map(([k, v]) => <div key={k} className="px-5 py-4"><div className="eyebrow">{k}</div><div className="text-[24px] font-semibold leading-8 tracking-tight tabular-nums">{v}</div></div>)}
      </div>
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <section className="panel"><div className="panel-h"><h2>Weekly performance</h2><span className="text-[12px] text-muted">Last 8 weeks · submitted</span></div><div className="p-4"><MiniBars data={weeks} label="Sales submitted per week" /></div></section>
        <section className="panel"><div className="panel-h"><h2>Monthly performance</h2><span className="text-[12px] text-muted">Last 3 months · submitted</span></div><div className="p-4"><MiniBars data={months} label="Sales submitted per month" /></div></section>
      </div>
      <section className="panel">
        <div className="panel-h"><h2>Order history</h2><Link className="text-[12px] text-brand no-underline" href="/orders">All orders</Link></div>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Package</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>{mine.slice(0, 15).map((o) => <tr key={o.id}><td><Link className="rowlink mono" href={`/orders/${o.no}`}>{o.no}</Link></td><td>{o.customer.name}</td><td className="text-muted">{pkgById(o.packageId).name}</td><td><Status o={o} /></td><td className="text-muted">{fmtDateTime(o.submittedAt)}</td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}
