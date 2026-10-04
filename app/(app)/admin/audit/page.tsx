"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { userById } from "@/lib/mock";
import { fmtDateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";

export default function AuditLog() {
  const { allOrders, audit } = useStore();
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const rows = useMemo(() => {
    const seeded = allOrders.slice(0, 200).flatMap((o) => o.history.filter((h) => h.kind !== "attention").slice(-2).map((h) => ({
      at: h.at, actor: h.actor, action: h.from === null && h.kind === "stage" ? "order.created" : "order.status_changed", entity: o.no, detail: h.kind === "stage" ? `${h.from ?? "—"} → ${h.to}` : `outcome → ${h.to}${h.reason ? ` (${h.reason})` : ""}` })));
    const live = audit.map((a) => ({ ...a, entity: allOrders.find((o) => o.id === a.entity)?.no ?? a.entity }));
    return [...live, ...seeded].sort((a, b) => b.at - a.at);
  }, [allOrders, audit]);
  const actions = [...new Set(rows.map((r) => r.action))].sort();
  const shown = rows.filter((r) => (!action || r.action === action) && (!q || `${r.entity} ${r.detail} ${userById(r.actor)?.name ?? r.actor}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 200);
  return (
    <>
      <PageHeader title="Audit log" sub="Append-only. Sensitive values (e.g. DOB) are never stored in log entries." />
      <div className="panel">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <label className="sr-only" htmlFor="aq">Search audit log</label><input id="aq" className="input input-sm w-64" placeholder="Search actor, entity, detail…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Action" className="input input-sm w-auto" value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{actions.map((a) => <option key={a}>{a}</option>)}</select>
        </div>
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          {shown.length === 0 ? <EmptyState title="No matching events." /> : (
            <table className="tbl"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th><th>IP</th></tr></thead>
              <tbody>{shown.map((r, i) => <tr key={i}><td className="text-muted">{fmtDateTime(r.at)}</td><td>{r.actor === "System" ? "System" : userById(r.actor)?.name ?? r.actor}</td><td className="mono">{r.action}</td><td className="mono">{r.entity}</td><td>{r.detail}</td><td className="mono text-faint">10.0.0.•</td></tr>)}</tbody></table>)}
        </div>
      </div>
    </>
  );
}
