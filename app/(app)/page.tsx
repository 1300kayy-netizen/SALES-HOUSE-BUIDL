"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { previousRange, resolveRange, statsBy, summarize, trend, type RangeKey } from "@/lib/metrics";
import { USERS, pkgById, userById, NOW } from "@/lib/mock";
import { fmtInt, fmtPct, fmtTime, relTime } from "@/lib/format";
import { PageHeader, Segmented, Skeleton, Status } from "@/components/ui";
import { TrendChart } from "@/components/charts";

const RANGES: { value: RangeKey; label: string }[] = [{ value: "today", label: "Today" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }];

export default function Home() {
  const { orders, role, actor } = useStore();
  const [key, setKey] = useState<RangeKey>("week");
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); const t = setTimeout(() => setLoading(false), 200); return () => clearTimeout(t); }, [key, role]);

  const range = useMemo(() => resolveRange(key), [key]);
  const s = useMemo(() => summarize(orders, range), [orders, range]);
  const prev = useMemo(() => summarize(orders, previousRange(range)), [orders, range]);
  const buckets = useMemo(() => trend(orders, range), [orders, range]);
  const open = useMemo(() => orders.filter((o) => !o.outcome), [orders]);
  const pipeline = [
    { label: "Submitted", n: open.filter((o) => o.stage === "submitted").length, q: "submitted" },
    { label: "Processing", n: open.filter((o) => o.stage === "processing").length, q: "processing" },
    { label: "Pending", n: open.filter((o) => o.stage === "pending").length, q: "pending" },
    { label: "Scheduled", n: open.filter((o) => o.stage === "scheduled").length, q: "scheduled" },
    { label: "Installed", n: open.filter((o) => o.stage === "installed").length, q: "installed" },
  ];
  const attention = useMemo(() => orders.filter((o) => o.attention && !o.outcome).sort((a, b) => a.updatedAt - b.updatedAt), [orders]);
  const recent = useMemo(() => orders.slice().sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 7), [orders]);
  const top = useMemo(() => [...statsBy(orders, range, (o) => o.repId).values()].sort((a, b) => b.submitted - a.submitted).slice(0, 5), [orders, range]);
  const delta = (a: number, b: number) => (b ? `${a >= b ? "↑" : "↓"} ${Math.abs(Math.round(((a - b) / b) * 100))}% vs previous` : "");
  const first = USERS.find((u) => u.id === actor.id)!.name.split(" ")[0];

  const kpis = [
    { label: "Submitted", value: fmtInt(s.submitted), sub: delta(s.submitted, prev.submitted), href: "/orders" },
    { label: "Installed", value: fmtInt(s.installed), sub: delta(s.installed, prev.installed), href: "/orders?view=installed" },
    { label: "Activation rate", value: fmtPct(s.activationRate), sub: `${s.activated} activated`, href: "/orders?status=activated" },
    { label: "Needs attention", value: fmtInt(attention.length), sub: attention.length ? "Review now →" : "All clear", href: "/orders?view=attention", warn: attention.length > 0 },
  ];

  return (
    <>
      <PageHeader title={`Good afternoon, ${first}`} sub={role === "rep" ? "Your sales at a glance." : "Here’s how the team is doing."} actions={<Segmented label="Date range" value={key} onChange={setKey} options={RANGES} />} />

      <div className="panel mb-4 grid grid-cols-2 lg:grid-cols-4 [&>*:not(:last-child)]:border-r [&>*]:border-line">
        {kpis.map((k, i) => (
          <Link key={k.label} href={k.href} className={`group block px-5 py-4 no-underline transition-colors hover:bg-subtle ${i < 2 ? "max-lg:border-b" : ""} ${i === 0 ? "rounded-tl-xl max-lg:rounded-tl-xl lg:rounded-l-xl" : ""} ${i === 3 ? "lg:rounded-r-xl" : ""}`}>
            <div className="eyebrow">{k.label}</div>
            {loading ? <Skeleton className="mt-2 h-9 w-16" /> : <div className="big mt-1" style={k.warn ? { color: "var(--warn)" } : undefined}>{k.value}</div>}
            <div className="mt-1 min-h-5 text-[12px] text-muted">{loading ? "" : k.sub}</div>
          </Link>
        ))}
      </div>

      <section className="panel mb-4" aria-label="Order pipeline">
        <div className="panel-h"><h2>Pipeline</h2><span className="text-[12px] text-muted">Open orders right now</span></div>
        <div className="grid grid-cols-2 gap-px p-3 sm:grid-cols-5">
          {pipeline.map((p, i) => (
            <Link key={p.label} href={`/orders?status=${p.q}`} className="group relative rounded-lg px-3 py-3 no-underline transition-colors hover:bg-subtle">
              <div className="text-[12px] text-muted">{p.label}</div>
              <div className="text-[24px] font-semibold leading-8 tracking-tight tabular-nums">{loading ? "–" : p.n}</div>
              {i < pipeline.length - 1 && <span aria-hidden="true" className="absolute right-0 top-1/2 hidden -translate-y-1/2 text-faint sm:block">›</span>}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5 [&>*]:min-w-0">
        <section className="panel lg:col-span-3" aria-labelledby="h-trend">
          <div className="panel-h"><h2 id="h-trend">Sales</h2><span className="text-[12px] text-muted">{range.label}</span></div>
          <div className="p-5">{loading ? <Skeleton className="h-[230px] w-full" /> : <TrendChart data={buckets} />}</div>
        </section>

        <section className="panel lg:col-span-2" aria-labelledby="h-attn">
          <div className="panel-h"><h2 id="h-attn">Needs attention</h2><Link href="/orders?view=attention" className="text-[12px] text-brand no-underline">View all</Link></div>
          {attention.length === 0 ? <p className="m-0 p-5 text-muted">Nothing needs attention.</p> : (
            <ul className="m-0 list-none px-2 pb-2 pt-2">{attention.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.no}`} className="block rounded-lg px-3 py-2 no-underline hover:bg-subtle">
                  <div className="flex justify-between gap-2"><span><span className="mono">{o.no}</span> <span className="text-muted">· {o.customer.name}</span></span><span className="shrink-0 text-[12px] text-faint">{relTime(o.updatedAt)}</span></div>
                  <div className="truncate text-[12px] text-warn">{o.attention}</div>
                </Link>
              </li>))}</ul>)}
        </section>

        <section className="panel lg:col-span-3" aria-labelledby="h-recent">
          <div className="panel-h"><h2 id="h-recent">Latest sales</h2><Link href="/orders" className="text-[12px] text-brand no-underline">All orders</Link></div>
          <div className="mt-2 overflow-x-auto">
            <table className="tbl"><caption className="sr-only">Latest sales</caption>
              <tbody>{recent.map((o) => (
                <tr key={o.id}>
                  <td><Link className="rowlink mono" href={`/orders/${o.no}`}>{o.no}</Link></td>
                  <td>{o.customer.name}<div className="text-[12px] text-faint">{pkgById(o.packageId).name}</div></td>
                  {role !== "rep" && <td className="max-sm:hidden text-muted">{userById(o.repId)?.name}</td>}
                  <td><Status o={o} /></td>
                  <td className="r text-faint">{NOW - o.submittedAt < 86400000 ? fmtTime(o.submittedAt) : relTime(o.submittedAt)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </section>

        {role !== "rep" ? (
          <section className="panel lg:col-span-2" aria-labelledby="h-top">
            <div className="panel-h"><h2 id="h-top">Top reps</h2><Link href="/team" className="text-[12px] text-brand no-underline">Leaderboard</Link></div>
            <ol className="m-0 list-none px-2 pb-2 pt-2">{top.map((r, i) => (
              <li key={r.repId}>
                <Link href={`/team/${r.repId}`} className="flex items-center gap-3 rounded-lg px-3 py-2 no-underline hover:bg-subtle">
                  <span className="w-4 text-[12px] text-faint tabular-nums">{i + 1}</span>
                  <span className="flex-1 truncate font-medium">{userById(r.repId)?.name}</span>
                  <span className="tabular-nums text-muted">{r.submitted}</span>
                </Link>
              </li>))}</ol>
          </section>
        ) : (
          <section className="panel lg:col-span-2">
            <div className="p-5">
              <div className="eyebrow">Next step</div>
              <p className="mb-4 mt-1">Just processed a sale in Zoey? Enter it now so your manager sees it.</p>
              <Link href="/orders/new" className="btn btn-primary btn-lg w-full no-underline">New sale</Link>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
