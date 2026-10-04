"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { DAY, NOW, PACKAGES, REPS, TEAMS, DEALERS, pkgById, startOfDay, userById, type Order } from "@/lib/mock";
import { fmtDate, fmtDateTime, relTime, csvCell } from "@/lib/format";
import { STAGE_LABEL, OUTCOME_LABEL, allowedTransitions, isAwaitingInstall, statusOf } from "@/lib/status";
import { can } from "@/lib/permissions";
import { Dialog, EmptyState, Menu, MenuItem, PageHeader, Status, cn, useToast } from "@/components/ui";

interface Filters { q: string; status: string; rep: string; team: string; pkg: string; market: string; dealer: string; range: string; attention: boolean; awaiting: boolean }
const EMPTY: Filters = { q: "", status: "", rep: "", team: "", pkg: "", market: "", dealer: "", range: "", attention: false, awaiting: false };
const PRESETS: { id: string; label: string; f: Partial<Filters> }[] = [
  { id: "all", label: "All orders", f: {} },
  { id: "today", label: "Today", f: { range: "today" } },
  { id: "attn", label: "Needs attention", f: { attention: true } },
  { id: "await", label: "Awaiting install", f: { awaiting: true } },
  { id: "cb", label: "Chargebacks", f: { status: "chargeback" } },
];
type ColKey = "no" | "submitted" | "agent" | "customer" | "address" | "pkg" | "dealer" | "status" | "install" | "manager" | "market" | "updated";
const COLS: { key: ColKey; label: string; sortable?: boolean; def: boolean }[] = [
  { key: "no", label: "Order ID", sortable: true, def: true }, { key: "submitted", label: "Submitted", sortable: true, def: true },
  { key: "agent", label: "Agent", sortable: true, def: true }, { key: "customer", label: "Customer", sortable: true, def: true },
  { key: "address", label: "Address", def: false }, { key: "pkg", label: "Package", sortable: true, def: true },
  { key: "dealer", label: "Dealer Login", def: false }, { key: "status", label: "Status", sortable: true, def: true },
  { key: "install", label: "Install Date", sortable: true, def: false }, { key: "manager", label: "Manager", def: false },
  { key: "market", label: "Market", def: false }, { key: "updated", label: "Last Updated", sortable: true, def: true },
];
const SAVED_KEY = "salesos.savedViews";

function matches(o: Order, f: Filters) {
  if (f.q) {
    const q = f.q.toLowerCase().trim();
    const hay = [o.no, o.customer.name, o.customer.email, o.customer.phone, o.address.line1, o.zoeyNo ?? ""].join(" ").toLowerCase();
    if (!hay.includes(q) && !o.customer.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000")) return false;
  }
  if (f.status) { const s = o.outcome ?? o.stage; if (s !== f.status) return false; }
  if (f.rep && o.repId !== f.rep) return false;
  if (f.team && o.teamId !== f.team) return false;
  if (f.pkg && o.packageId !== f.pkg) return false;
  if (f.market && o.market !== f.market) return false;
  if (f.dealer && o.dealerLogin !== f.dealer) return false;
  if (f.attention && !(o.attention && !o.outcome)) return false;
  if (f.awaiting && !isAwaitingInstall(o)) return false;
  if (f.range) {
    const start = f.range === "today" ? startOfDay(NOW) : f.range === "7" ? startOfDay(NOW) - 6 * DAY : startOfDay(NOW) - 29 * DAY;
    if (o.submittedAt < start) return false;
  }
  return true;
}

function OrdersInner() {
  const { orders, role, changeStatus, logAudit, actor } = useStore();
  const toast = useToast();
  const sp = useSearchParams();
  const [f, setF] = useState<Filters>(EMPTY);
  const [view, setView] = useState("all");
  const [sort, setSort] = useState<{ k: ColKey; dir: 1 | -1 }>({ k: "submitted", dir: -1 });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [visible, setVisible] = useState<Record<string, boolean>>(() => Object.fromEntries(COLS.map((c) => [c.key, c.def && !(c.key === "agent" && role === "rep")])));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | { to: string; kind: "stage" | "outcome" | "next" }>(null);
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState<{ id: string; label: string; f: Filters }[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  useEffect(() => { try { setSaved(JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]")); } catch {} }, []);
  useEffect(() => { const s = sp.get("status"); if (s) setF({ ...EMPTY, status: s }); }, [sp]);
  useEffect(() => { setVisible((v) => ({ ...v, agent: role !== "rep" })); }, [role]);

  const filtered = useMemo(() => orders.filter((o) => matches(o, f)), [orders, f]);
  const sorted = useMemo(() => {
    const val = (o: Order): string | number => {
      switch (sort.k) {
        case "no": return Number(o.no.slice(4)); case "submitted": return o.submittedAt; case "agent": return userById(o.repId)?.name ?? "";
        case "customer": return o.customer.name; case "pkg": return pkgById(o.packageId).name; case "status": return statusOf(o).label;
        case "install": return o.installDate ?? 0; case "updated": return o.updatedAt; default: return 0;
      }
    };
    return [...filtered].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [filtered, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const cur = Math.min(page, pages - 1);
  const rows = sorted.slice(cur * size, cur * size + size);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => { setF((x) => ({ ...x, [k]: v })); setPage(0); setView(""); };
  const applyView = (id: string, fl: Partial<Filters>) => { setF({ ...EMPTY, ...fl }); setView(id); setPage(0); setSel(new Set()); };
  const activeFilters = (Object.keys(EMPTY) as (keyof Filters)[]).filter((k) => f[k] && f[k] !== EMPTY[k]);
  const allOnPage = rows.length > 0 && rows.every((o) => sel.has(o.id));
  const selected = orders.filter((o) => sel.has(o.id));
  const vis = COLS.filter((c) => visible[c.key]);

  const doBulk = () => {
    if (!bulk) return;
    let ok = 0, skip = 0;
    const groups = new Map<string, { kind: "stage" | "outcome"; ids: string[] }>();
    for (const o of selected) {
      const t = allowedTransitions(o, role);
      const target = bulk.kind === "next" ? t.find((x) => x.kind === "stage" && !x.requiresReason) : t.find((x) => x.to === bulk.to);
      if (!target) { skip++; continue; }
      const g = groups.get(target.to) ?? { kind: target.kind, ids: [] }; g.ids.push(o.id); groups.set(target.to, g); ok++;
    }
    groups.forEach((g, to) => changeStatus(g.ids, g.kind, to, reason));
    toast(`${ok} updated${skip ? `, ${skip} skipped (transition not allowed)` : ""}`);
    setBulk(null); setReason(""); setSel(new Set());
  };

  const exportCsv = () => {
    const head = ["Order ID", "Submitted", "Agent", "Customer", "Email", "Phone", "Address", "Package", "Dealer Login", "Status", "Market"];
    const lines = [head.map(csvCell).join(",")].concat(sorted.map((o) => [o.no, new Date(o.submittedAt).toISOString(), userById(o.repId)?.name, o.customer.name, o.customer.email, o.customer.phone,
      `${o.address.line1} ${o.address.unit}, ${o.address.city} ${o.address.state} ${o.address.zip}`, pkgById(o.packageId).name, o.dealerLogin, statusOf(o).label, o.market].map(csvCell).join(",")));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "orders-sample.csv"; a.click(); URL.revokeObjectURL(url);
    logAudit({ actor: actor.id, action: "export.generated", entity: "orders", detail: `${sorted.length} rows, DOB excluded` });
    toast(`Exported ${sorted.length} rows (DOB excluded)`);
  };

  const cell = (o: Order, k: ColKey) => {
    switch (k) {
      case "no": return <Link className="rowlink mono" href={`/orders/${o.no}`}>{o.no}</Link>;
      case "submitted": return <span className="text-muted">{fmtDateTime(o.submittedAt)}</span>;
      case "agent": return userById(o.repId)?.name;
      case "customer": return o.customer.name;
      case "address": return `${o.address.line1}${o.address.unit ? ", " + o.address.unit : ""}, ${o.address.city}`;
      case "pkg": return pkgById(o.packageId).name;
      case "dealer": return <span className="mono">{o.dealerLogin}</span>;
      case "status": return <Status o={o} />;
      case "install": return o.installDate ? fmtDate(o.installDate) : <span className="text-faint">—</span>;
      case "manager": return userById(o.managerId)?.name;
      case "market": return o.market;
      case "updated": return <span className="text-muted">{relTime(o.updatedAt)}</span>;
    }
  };
  const sel_ = "input input-sm w-auto";

  return (
    <>
      <PageHeader title="Orders" sub={`${sorted.length.toLocaleString()} ${sorted.length === 1 ? "order" : "orders"}${role === "rep" ? " · your sales" : role === "manager" ? " · your team" : ""}`}
        actions={<>
          {can.exportData(role) && <button className="btn" onClick={exportCsv}>Export CSV</button>}
          <Link href="/orders/new" className="btn btn-primary no-underline">Submit sale</Link>
        </>} />

      <div role="tablist" aria-label="Saved views" className="mb-3 flex flex-wrap items-center gap-1 border-b border-line">
        {[...PRESETS, ...saved].map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => applyView(v.id, "f" in v ? v.f : {})}
            className={cn("-mb-px h-8 border-b-2 px-3 text-[13px]", view === v.id ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>{v.label}</button>
        ))}
        {activeFilters.length > 0 && <button className="ml-auto h-8 px-2 text-[12px] text-brand" onClick={() => setSaveOpen(true)}>Save view…</button>}
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="sr-only" htmlFor="q">Search orders</label>
          <input id="q" className="input input-sm w-full sm:w-64" placeholder="Search order, customer, phone, address…" value={f.q} onChange={(e) => set("q", e.target.value)} />
          <select aria-label="Status" className={sel_} value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            {Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="Date range" className={sel_} value={f.range} onChange={(e) => set("range", e.target.value)}>
            <option value="">Any date</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
          </select>
          {role !== "rep" && <select aria-label="Representative" className={sel_} value={f.rep} onChange={(e) => set("rep", e.target.value)}>
            <option value="">All reps</option>{REPS.filter((r) => role === "admin" || r.managerId === actor.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
          {role === "admin" && <select aria-label="Team" className={sel_} value={f.team} onChange={(e) => set("team", e.target.value)}>
            <option value="">All teams</option>{TEAMS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
          <select aria-label="Package" className={sel_} value={f.pkg} onChange={(e) => set("pkg", e.target.value)}>
            <option value="">All packages</option>{PACKAGES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {role === "admin" && <select aria-label="Market" className={sel_} value={f.market} onChange={(e) => set("market", e.target.value)}>
            <option value="">All markets</option>{["Philadelphia", "Atlanta", "Houston"].map((m) => <option key={m}>{m}</option>)}</select>}
          {role !== "rep" && <select aria-label="Dealer login" className={sel_} value={f.dealer} onChange={(e) => set("dealer", e.target.value)}>
            <option value="">All dealer logins</option>{DEALERS.map((d) => <option key={d.id} value={d.login}>{d.login}</option>)}</select>}
          <div className="ml-auto">
            <Menu label="Columns">
              {COLS.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-subtle">
                  <input type="checkbox" checked={!!visible[c.key]} disabled={c.key === "no"} onChange={(e) => setVisible({ ...visible, [c.key]: e.target.checked })} />{c.label}
                </label>))}
            </Menu>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            {activeFilters.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 rounded border border-line-strong px-2 py-0.5 text-[12px]">
                <span className="text-muted">{k === "attention" ? "Needs attention" : k === "awaiting" ? "Awaiting install" : k}</span>
                {typeof f[k] === "string" && <b className="font-medium">{String(f[k])}</b>}
                <button aria-label={`Remove ${k} filter`} className="text-faint hover:text-ink" onClick={() => set(k, (typeof f[k] === "boolean" ? false : "") as never)}>×</button>
              </span>))}
            <button className="text-[12px] text-brand" onClick={() => applyView("all", {})}>Clear all</button>
          </div>
        )}

        <div className="max-h-[calc(100vh-290px)] min-h-[200px] overflow-auto">
          <table className="tbl">
            <caption className="sr-only">Orders</caption>
            <thead><tr>
              <th style={{ width: 36 }}><input type="checkbox" aria-label="Select all on page" checked={allOnPage} onChange={(e) => { const n = new Set(sel); rows.forEach((o) => (e.target.checked ? n.add(o.id) : n.delete(o.id))); setSel(n); }} /></th>
              {vis.map((c) => (
                <th key={c.key} aria-sort={sort.k === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                  {c.sortable ? <button className="th-btn" onClick={() => setSort((s) => ({ k: c.key, dir: s.k === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}>{c.label}<span aria-hidden="true">{sort.k === c.key ? (sort.dir === 1 ? "↑" : "↓") : ""}</span></button> : c.label}
                </th>))}
              <th aria-label="Actions" />
            </tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} data-selected={sel.has(o.id)}>
                  <td><input type="checkbox" aria-label={`Select ${o.no}`} checked={sel.has(o.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(o.id) : n.delete(o.id); setSel(n); }} /></td>
                  {vis.map((c) => <td key={c.key}>{cell(o, c.key)}</td>)}
                  <td className="r"><Link className="text-[12px] text-brand" href={`/orders/${o.no}`}>View</Link></td>
                </tr>))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState title="No orders match these filters." body="Try a different search or clear the filters." action={<button className="btn btn-sm" onClick={() => applyView("all", {})}>Clear filters</button>} />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[12px] text-muted">
          <span>{sorted.length ? `${cur * size + 1}–${Math.min(sorted.length, cur * size + size)} of ${sorted.length.toLocaleString()}` : "0 results"}</span>
          <div className="flex items-center gap-2">
            <label htmlFor="ps">Rows</label>
            <select id="ps" className="input input-sm w-auto" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>
            <button className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
            <span>Page {cur + 1} / {pages}</span>
            <button className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
          </div>
        </div>
      </div>

      {sel.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="fade fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 py-2" style={{ boxShadow: "var(--shadow-pop)" }}>
          <span className="font-medium">{sel.size} selected</span>
          {can.changeStatus(role) ? (
            <Menu label="Update status" align="left">
              <MenuItem onClick={() => setBulk({ to: "", kind: "next" })}>Advance to next stage</MenuItem>
              <MenuItem onClick={() => setBulk({ to: "cancelled", kind: "outcome" })}>Mark Cancelled</MenuItem>
              <MenuItem onClick={() => setBulk({ to: "failed", kind: "outcome" })}>Mark Failed</MenuItem>
              <MenuItem onClick={() => setBulk({ to: "duplicate", kind: "outcome" })}>Mark Duplicate</MenuItem>
            </Menu>) : <span className="text-muted">Bulk status updates require Manager or Admin.</span>}
          <button className="btn btn-sm btn-ghost" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      <Dialog open={!!bulk} onClose={() => setBulk(null)} title="Confirm bulk status update"
        footer={<><button className="btn" onClick={() => setBulk(null)}>Cancel</button><button className="btn btn-primary" onClick={doBulk} disabled={bulk?.kind === "outcome" && !reason.trim()}>Apply to {sel.size}</button></>}>
        <p className="mt-0">{bulk?.kind === "next" ? "Move each selected order to its next lifecycle stage." : `Mark ${sel.size} orders as ${bulk?.to}.`} Orders where this transition isn’t allowed are skipped.</p>
        <label className="label" htmlFor="bulk-reason">Reason{bulk?.kind === "outcome" ? " (required)" : " (optional)"}</label>
        <input id="bulk-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} title="Save view"
        footer={<><button className="btn" onClick={() => setSaveOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={!saveName.trim()} onClick={() => {
          const n = [...saved, { id: "u" + Date.now(), label: saveName.trim(), f }]; setSaved(n); try { localStorage.setItem(SAVED_KEY, JSON.stringify(n)); } catch {}
          setSaveOpen(false); setSaveName(""); toast("View saved");
        }}>Save</button></>}>
        <label className="label" htmlFor="vn">View name</label><input id="vn" className="input" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
      </Dialog>
    </>
  );
}

export default function OrdersPage() { return <Suspense><OrdersInner /></Suspense>; }
