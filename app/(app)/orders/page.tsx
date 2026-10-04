"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { DAY, NOW, PACKAGES, REPS, pkgById, startOfDay, userById, type Order } from "@/lib/mock";
import { csvCell, fmtDateTime, relTime } from "@/lib/format";
import { STAGE_LABEL, OUTCOME_LABEL, allowedTransitions, isAwaitingInstall, statusOf } from "@/lib/status";
import { can } from "@/lib/permissions";
import { Dialog, EmptyState, PageHeader, Status, cn, useToast } from "@/components/ui";

type View = "all" | "attention" | "await" | "installed" | "closed";
const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" }, { id: "attention", label: "Needs attention" }, { id: "await", label: "Awaiting install" }, { id: "installed", label: "Installed" }, { id: "closed", label: "Closed" },
];
const PAGE = 25;

interface F { q: string; rep: string; pkg: string; range: string; status: string }
const EMPTY: F = { q: "", rep: "", pkg: "", range: "", status: "" };

function inView(o: Order, v: View) {
  switch (v) {
    case "attention": return !!o.attention && !o.outcome;
    case "await": return isAwaitingInstall(o);
    case "installed": return !o.outcome && (o.stage === "installed" || o.stage === "activated");
    case "closed": return !!o.outcome;
    default: return true;
  }
}
function match(o: Order, f: F) {
  if (f.q) {
    const q = f.q.toLowerCase().trim(), digits = q.replace(/\D/g, "");
    const hay = [o.no, o.customer.name, o.customer.email, o.address.line1, o.dealerLogin, o.zoeyNo ?? ""].join(" ").toLowerCase();
    if (!hay.includes(q) && !(digits.length > 2 && o.customer.phone.replace(/\D/g, "").includes(digits))) return false;
  }
  if (f.status && (o.outcome ?? o.stage) !== f.status) return false;
  if (f.rep && o.repId !== f.rep) return false;
  if (f.pkg && o.packageId !== f.pkg) return false;
  if (f.range) {
    const start = f.range === "today" ? startOfDay(NOW) : f.range === "7" ? startOfDay(NOW) - 6 * DAY : startOfDay(NOW) - 29 * DAY;
    if (o.submittedAt < start) return false;
  }
  return true;
}

function OrdersInner() {
  const { orders, role, actor, changeStatus, logAudit } = useStore();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const view = (sp.get("view") as View) || "all";
  const [f, setF] = useState<F>({ ...EMPTY, status: sp.get("status") ?? "" });
  const [sort, setSort] = useState<{ k: "submitted" | "customer" | "status"; dir: 1 | -1 }>({ k: "submitted", dir: -1 });
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | "next" | "cancelled">(null);
  const [reason, setReason] = useState("");

  useEffect(() => { setF((x) => ({ ...x, status: sp.get("status") ?? "" })); setPage(0); setSel(new Set()); }, [sp]);

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, orders.filter((o) => inView(o, v.id)).length])) as Record<View, number>, [orders]);
  const rows = useMemo(() => {
    const list = orders.filter((o) => inView(o, view) && match(o, f));
    const val = (o: Order) => (sort.k === "submitted" ? o.submittedAt : sort.k === "customer" ? o.customer.name : statusOf(o).label);
    return list.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [orders, view, f, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PAGE, cur * PAGE + PAGE);
  const set = <K extends keyof F>(k: K, v: F[K]) => { setF((x) => ({ ...x, [k]: v })); setPage(0); };
  const filtered = f.q || f.rep || f.pkg || f.range || f.status;
  const pageAll = shown.length > 0 && shown.every((o) => sel.has(o.id));
  const selected = orders.filter((o) => sel.has(o.id));
  const setView = (v: View) => router.replace(v === "all" ? "/orders" : `/orders?view=${v}`);
  const th = (k: typeof sort.k, label: string) => (
    <th aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button className="th-btn" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>{label}<span aria-hidden="true">{sort.k === k ? (sort.dir === 1 ? "↑" : "↓") : ""}</span></button>
    </th>
  );

  const doBulk = () => {
    if (!bulk) return;
    const groups = new Map<string, { kind: "stage" | "outcome"; ids: string[] }>();
    let skip = 0;
    for (const o of selected) {
      const t = allowedTransitions(o, role);
      const target = bulk === "next" ? t.find((x) => x.kind === "stage" && !x.requiresReason) : t.find((x) => x.to === "cancelled");
      if (!target) { skip++; continue; }
      const g = groups.get(target.to) ?? { kind: target.kind, ids: [] }; g.ids.push(o.id); groups.set(target.to, g);
    }
    let ok = 0;
    groups.forEach((g, to) => { changeStatus(g.ids, g.kind, to, reason.trim()); ok += g.ids.length; });
    toast(`${ok} updated${skip ? ` · ${skip} skipped` : ""}`);
    setBulk(null); setReason(""); setSel(new Set());
  };

  const exportCsv = () => {
    const head = ["Order", "Submitted", "Agent", "Customer", "Email", "Phone", "Address", "Package", "Dealer login", "Status"];
    const lines = [head.join(",")].concat(rows.map((o) => [o.no, new Date(o.submittedAt).toISOString(), userById(o.repId)?.name, o.customer.name, o.customer.email, o.customer.phone,
      `${o.address.line1} ${o.address.unit}, ${o.address.city} ${o.address.state} ${o.address.zip}`, pkgById(o.packageId).name, o.dealerLogin, statusOf(o).label].map(csvCell).join(",")));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "orders-sample.csv"; a.click(); URL.revokeObjectURL(url);
    logAudit({ actor: actor.id, action: "export.generated", entity: "orders", detail: `${rows.length} rows, DOB excluded` });
    toast(`Exported ${rows.length} orders · DOB excluded`);
  };

  return (
    <>
      <PageHeader title="Orders" sub={role === "rep" ? "Your sales" : role === "manager" ? "Your team’s sales" : "Every sale, in one place"}
        actions={<>
          {can.exportData(role) && <button className="btn" onClick={exportCsv}>Export</button>}
          <Link href="/orders/new" className="btn btn-primary no-underline">New sale</Link>
        </>} />

      <div role="tablist" aria-label="Order views" className="mb-4 flex flex-wrap border-b border-line">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" className="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}>
            {v.label}<span className="ml-1.5 text-[12px] text-faint tabular-nums">{counts[v.id]}</span>
          </button>))}
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <label className="sr-only" htmlFor="q">Search orders</label>
          <input id="q" className="input input-sm w-full sm:w-80" placeholder="Search name, phone, address, order #" value={f.q} onChange={(e) => set("q", e.target.value)} />
          {role !== "rep" && <select aria-label="Agent" className="input input-sm w-auto" value={f.rep} onChange={(e) => set("rep", e.target.value)}>
            <option value="">All agents</option>{REPS.filter((r) => role === "admin" || r.managerId === actor.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
          <select aria-label="Package" className="input input-sm w-auto" value={f.pkg} onChange={(e) => set("pkg", e.target.value)}>
            <option value="">All packages</option>{PACKAGES.filter((p) => p.category === "internet").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select aria-label="Date" className="input input-sm w-auto" value={f.range} onChange={(e) => set("range", e.target.value)}>
            <option value="">Any date</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
          {f.status && <button className="btn btn-sm" onClick={() => { set("status", ""); router.replace("/orders"); }}>Status: {STAGE_LABEL[f.status as keyof typeof STAGE_LABEL] ?? OUTCOME_LABEL[f.status as keyof typeof OUTCOME_LABEL]} ×</button>}
          {filtered ? <button className="btn btn-sm btn-ghost" onClick={() => { setF(EMPTY); router.replace("/orders"); }}>Clear</button> : null}
        </div>

        <div className="max-h-[calc(100vh-330px)] min-h-[200px] overflow-auto border-t border-line">
          <table className="tbl">
            <caption className="sr-only">Orders</caption>
            <thead><tr>
              {can.changeStatus(role) && <th style={{ width: 40, paddingRight: 0 }}><input type="checkbox" aria-label="Select all on page" checked={pageAll} onChange={(e) => { const n = new Set(sel); shown.forEach((o) => (e.target.checked ? n.add(o.id) : n.delete(o.id))); setSel(n); }} /></th>}
              <th>Order</th>{th("customer", "Customer")}<th>Package</th>{role !== "rep" && <th>Agent</th>}{th("status", "Status")}{th("submitted", "Submitted")}
            </tr></thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id} data-selected={sel.has(o.id)} onDoubleClick={() => router.push(`/orders/${o.no}`)}>
                  {can.changeStatus(role) && <td style={{ paddingRight: 0 }}><input type="checkbox" aria-label={`Select ${o.no}`} checked={sel.has(o.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(o.id) : n.delete(o.id); setSel(n); }} /></td>}
                  <td><Link className="rowlink mono" href={`/orders/${o.no}`}>{o.no}</Link></td>
                  <td>{o.customer.name}<div className="text-[12px] text-faint">{o.address.line1}, {o.address.city}</div></td>
                  <td className="text-muted">{pkgById(o.packageId).name}</td>
                  {role !== "rep" && <td className="text-muted">{userById(o.repId)?.name}</td>}
                  <td><Status o={o} /></td>
                  <td className="text-muted" title={fmtDateTime(o.submittedAt)}>{relTime(o.submittedAt)}</td>
                </tr>))}
            </tbody>
          </table>
          {shown.length === 0 && <EmptyState title={filtered ? "No orders match." : "No orders here yet."} body={filtered ? "Try a different search or clear the filters." : undefined}
            action={filtered ? <button className="btn btn-sm" onClick={() => { setF(EMPTY); router.replace("/orders"); }}>Clear filters</button> : <Link href="/orders/new" className="btn btn-primary btn-sm no-underline">New sale</Link>} />}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[13px] text-muted">
          <span>{rows.length ? `${cur * PAGE + 1}–${Math.min(rows.length, cur * PAGE + PAGE)} of ${rows.length.toLocaleString()}` : "0 results"}</span>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
            <button className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
          </div>
        </div>
      </div>

      {sel.size > 0 && (
        <div role="region" aria-label="Bulk actions" className={cn("fade fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-line-strong bg-surface py-2 pl-4 pr-2")} style={{ boxShadow: "var(--shadow-pop)" }}>
          <span className="mr-2 font-medium">{sel.size} selected</span>
          <button className="btn btn-sm btn-primary" onClick={() => setBulk("next")}>Advance to next step</button>
          <button className="btn btn-sm" onClick={() => setBulk("cancelled")}>Cancel orders</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      <Dialog open={!!bulk} onClose={() => setBulk(null)} title={bulk === "next" ? `Advance ${sel.size} orders?` : `Cancel ${sel.size} orders?`}
        footer={<><button className="btn" onClick={() => setBulk(null)}>Back</button><button className={cn("btn", bulk === "next" ? "btn-primary" : "")} onClick={doBulk} disabled={bulk === "cancelled" && !reason.trim()}>{bulk === "next" ? "Advance" : "Cancel orders"}</button></>}>
        <p className="mt-0 text-muted">{bulk === "next" ? "Each order moves one step along its normal path. Orders that can’t make this move are skipped." : "Selected orders are marked Cancelled with your reason."}</p>
        {bulk === "cancelled" && <><label className="label" htmlFor="bulk-reason">Reason</label><input id="bulk-reason" className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required" /></>}
      </Dialog>
    </>
  );
}

export default function OrdersPage() { return <Suspense><OrdersInner /></Suspense>; }
