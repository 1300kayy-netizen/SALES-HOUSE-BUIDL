"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { previousRange, resolveRange, statsBy, summarize, trend, type RangeKey } from "@/lib/metrics";
import { DAY, NOW, PACKAGES, TEAMS, pkgById, startOfDay, userById } from "@/lib/mock";
import { fmtDateTime, fmtInt, fmtPct, isoDate, parseIsoDate, relTime } from "@/lib/format";
import { OUTCOME_LABEL, STAGE_LABEL } from "@/lib/status";
import { PageHeader, Segmented, Skeleton, Status } from "@/components/ui";
import { StackedBar, TrendChart } from "@/components/charts";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "custom", label: "Custom" },
];

export default function Overview() {
  const { orders, role } = useStore();
  const [key, setKey] = useState<RangeKey>("week");
  const [from, setFrom] = useState(isoDate(startOfDay(NOW) - 6 * DAY));
  const [to, setTo] = useState(isoDate(startOfDay(NOW)));
  const [team, setTeam] = useState("all");
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); const t = setTimeout(() => setLoading(false), 220); return () => clearTimeout(t); }, [key, from, to, team, role]);

  const range = useMemo(() => resolveRange(key, { from: parseIsoDate(from), to: parseIsoDate(to) }), [key, from, to]);
  const scoped = useMemo(() => (team === "all" ? orders : orders.filter((o) => o.teamId === team)), [orders, team]);
  const s = useMemo(() => summarize(scoped, range), [scoped, range]);
  const prev = useMemo(() => summarize(scoped, previousRange(range)), [scoped, range]);
  const buckets = useMemo(() => trend(scoped, range), [scoped, range]);

  const cohort = useMemo(() => scoped.filter((o) => o.submittedAt >= range.start && o.submittedAt < range.end), [scoped, range]);
  const dist = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of cohort) { const k = o.outcome ? OUTCOME_LABEL[o.outcome] : STAGE_LABEL[o.stage]; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [cohort]);
  const palette: Record<string, string> = { Submitted: "#8a8a98", Processing: "var(--info)", Pending: "var(--warn)", Scheduled: "#6fa8e8", Installed: "var(--ok)", Activated: "#0b5c42", Cancelled: "var(--bad)", Failed: "#e0746b", Duplicate: "#b4b4c0", Chargeback: "#7a1710" };

  const top = useMemo(() => [...statsBy(scoped, range, (o) => o.repId).values()].sort((a, b) => b.submitted - a.submitted).slice(0, 8), [scoped, range]);
  const attention = useMemo(() => scoped.filter((o) => o.attention && !o.outcome).sort((a, b) => a.updatedAt - b.updatedAt).slice(0, 6), [scoped]);
  const recent = useMemo(() => [...scoped].sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 10), [scoped]);
  const installs = useMemo(() => scoped.filter((o) => o.installedAt).sort((a, b) => b.installedAt! - a.installedAt!).slice(0, 8), [scoped]);
  const pkgMix = useMemo(() => {
    const m = new Map<string, number>(); for (const o of cohort) m.set(o.packageId, (m.get(o.packageId) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [cohort]);
  const teamFallout = useMemo(() => TEAMS.map((t) => {
    const c = cohort.filter((o) => o.teamId === t.id); const f = c.filter((o) => o.outcome === "cancelled" || o.outcome === "failed" || o.outcome === "duplicate").length;
    return { name: t.name, n: c.length, rate: c.length ? f / c.length : NaN };
  }).filter((t) => t.n), [cohort]);

  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / b) * 100))}% vs prior` : "");
  const kpis: { label: string; value: string; sub?: string }[] = [
    { label: "Submitted", value: fmtInt(s.submitted), sub: delta(s.submitted, prev.submitted) },
    { label: "Installed", value: fmtInt(s.installed), sub: delta(s.installed, prev.installed) },
    { label: "Activation rate", value: fmtPct(s.activationRate), sub: `${s.activated} activated` },
    { label: "Pending", value: fmtInt(s.pending), sub: `${s.awaitingInstall} awaiting install` },
    { label: "Cancelled", value: fmtInt(s.cancelled), sub: `fallout ${fmtPct(s.falloutRate)}` },
    { label: "Chargebacks", value: fmtInt(s.chargebacks) },
    { label: role === "rep" ? "Avg / day" : "Active reps", value: role === "rep" ? (s.submitted / Math.max(1, Math.round((Math.min(range.end, NOW + DAY) - range.start) / DAY))).toFixed(1) : fmtInt(s.activeReps) },
    { label: "Commission", value: "—", sub: "Module not enabled" },
  ];

  return (
    <>
      <PageHeader title="The Sales House" sub={role === "rep" ? "My sales" : "Sales Operations"}
        actions={<>
          {role === "admin" && (
            <select aria-label="Team" className="input input-sm w-auto" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="all">All teams</option>{TEAMS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <Segmented label="Date range" value={key} onChange={setKey} options={RANGES} />
        </>}>
        {key === "custom" && (
          <div className="mt-3 flex items-center gap-2">
            <label className="sr-only" htmlFor="from">From</label><input id="from" type="date" className="input input-sm w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-muted">to</span>
            <label className="sr-only" htmlFor="to">To</label><input id="to" type="date" className="input input-sm w-auto" value={to} min={from} max={isoDate(startOfDay(NOW))} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </PageHeader>

      <div className="panel mb-4 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 [&>*]:border-b [&>*]:border-r [&>*]:border-line">
        {kpis.map((k) => (
          <div key={k.label} className="px-4 py-3">
            <div className="eyebrow">{k.label}</div>
            {loading ? <Skeleton className="mt-1 h-7 w-14" /> : <div className="text-[22px] font-semibold leading-7 tracking-tight tabular-nums">{k.value}</div>}
            <div className="min-h-4 text-[12px] text-muted">{loading ? "" : k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <section className="panel" aria-labelledby="h-trend">
            <div className="panel-h"><h2 id="h-trend">Sales trend</h2><span className="text-[12px] text-muted">{range.label}</span></div>
            <div className="p-4">{loading ? <Skeleton className="h-[220px] w-full" /> : <TrendChart data={buckets} />}</div>
          </section>

          <section className="panel" aria-labelledby="h-recent">
            <div className="panel-h"><h2 id="h-recent">Recent submissions</h2><Link href="/orders" className="text-[12px] text-brand">View all orders</Link></div>
            <div className="overflow-x-auto">
              <table className="tbl"><caption className="sr-only">Most recent submissions</caption>
                <thead><tr><th>Order</th><th>Submitted</th>{role !== "rep" && <th>Agent</th>}<th>Customer</th><th>Package</th><th>Status</th></tr></thead>
                <tbody>{recent.map((o) => (
                  <tr key={o.id}>
                    <td><Link className="rowlink mono" href={`/orders/${o.no}`}>{o.no}</Link></td>
                    <td className="text-muted">{fmtDateTime(o.submittedAt)}</td>
                    {role !== "rep" && <td>{userById(o.repId)?.name}</td>}
                    <td>{o.customer.name}</td><td>{pkgById(o.packageId).name}</td><td><Status o={o} /></td>
                  </tr>))}</tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="panel" aria-labelledby="h-status">
            <div className="panel-h"><h2 id="h-status">Status distribution</h2><span className="text-[12px] text-muted">{cohort.length} orders</span></div>
            <div className="p-4">
              {loading ? <Skeleton className="h-24 w-full" /> : cohort.length === 0 ? <p className="m-0 text-muted">No orders in this range.</p> : <>
                <StackedBar parts={dist.map(([label, value]) => ({ label, value, color: palette[label] ?? "#999" }))} />
                <table className="tbl mt-2"><tbody>{dist.map(([label, v]) => (
                  <tr key={label}><td style={{ height: 30 }}><span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-sm" style={{ background: palette[label] }} />{label}</span></td><td className="r" style={{ height: 30 }}>{v}</td><td className="r text-muted" style={{ height: 30 }}>{fmtPct(v / cohort.length)}</td></tr>))}</tbody></table>
              </>}
            </div>
          </section>

          {role !== "rep" && (
            <section className="panel" aria-labelledby="h-top">
              <div className="panel-h"><h2 id="h-top">Top representatives</h2><Link href="/team/leaderboard" className="text-[12px] text-brand">Leaderboard</Link></div>
              <table className="tbl"><thead><tr><th>Rep</th><th className="r">Sub</th><th className="r">Inst</th><th className="r">Act %</th></tr></thead>
                <tbody>{top.map((r) => (
                  <tr key={r.repId}><td><Link className="rowlink" href={`/team/representatives/${r.repId}`}>{userById(r.repId)?.name}</Link></td><td className="r">{r.submitted}</td><td className="r">{r.installed}</td><td className="r">{fmtPct(r.activationRate)}</td></tr>))}
                </tbody></table>
            </section>
          )}

          <section className="panel" aria-labelledby="h-attn">
            <div className="panel-h"><h2 id="h-attn">Needs attention</h2>{role !== "rep" && <Link href="/ops/exceptions" className="text-[12px] text-brand">Open queue</Link>}</div>
            {attention.length === 0 ? <p className="m-0 p-4 text-muted">Nothing needs attention.</p> : (
              <ul className="m-0 list-none p-0">{attention.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-3 border-b border-line px-4 py-2 last:border-0">
                  <div className="min-w-0"><Link className="rowlink mono" href={`/orders/${o.no}`}>{o.no}</Link> <span className="text-muted">· {o.customer.name}</span><div className="truncate text-[12px] text-muted">{o.attention}</div></div>
                  <span className="shrink-0 text-[12px] text-muted">{relTime(o.updatedAt)}</span>
                </li>))}</ul>)}
          </section>

          <section className="panel" aria-labelledby="h-inst">
            <div className="panel-h"><h2 id="h-inst">Recent installs</h2></div>
            <ul className="m-0 list-none p-0">{installs.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-0">
                <span className="min-w-0 truncate"><Link className="rowlink mono" href={`/orders/${o.no}`}>{o.no}</Link> <span className="text-muted">· {o.customer.name}</span></span>
                <span className="shrink-0 text-[12px] text-muted">{relTime(o.installedAt!)}</span>
              </li>))}</ul>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <section className="panel" aria-labelledby="h-fall">
              <div className="panel-h"><h2 id="h-fall">Cancellation / fallout</h2><span className="text-[12px] text-muted">{fmtPct(s.falloutRate)} overall</span></div>
              <table className="tbl"><thead><tr><th>Team</th><th className="r">Orders</th><th className="r">Fallout</th></tr></thead>
                <tbody>{teamFallout.map((t) => <tr key={t.name}><td>{t.name}</td><td className="r">{t.n}</td><td className="r">{fmtPct(t.rate)}</td></tr>)}</tbody></table>
            </section>
            <section className="panel" aria-labelledby="h-mix">
              <div className="panel-h"><h2 id="h-mix">Package mix</h2></div>
              <table className="tbl"><tbody>{pkgMix.map(([id, n]) => <tr key={id}><td>{PACKAGES.find((p) => p.id === id)?.name}</td><td className="r">{n}</td><td className="r text-muted">{fmtPct(n / Math.max(1, cohort.length))}</td></tr>)}</tbody></table>
            </section>
          </div>
        </div>
      </div>
      <p className="mt-4 text-[12px] text-faint">Sample data. Metric definitions: Installed counts install events in range; activation rate is cohort-based (orders submitted in range that reached Activated).</p>
    </>
  );
}
