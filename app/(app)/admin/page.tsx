"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { DEALERS, PACKAGES, TEAMS, USERS, userById } from "@/lib/mock";
import { ROLE_LABEL } from "@/lib/permissions";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { EmptyState, PageHeader, useToast } from "@/components/ui";

type Tab = "users" | "packages" | "dealers" | "audit";
const TABS: { id: Tab; label: string }[] = [{ id: "users", label: "People" }, { id: "packages", label: "Packages" }, { id: "dealers", label: "Dealer logins" }, { id: "audit", label: "Audit log" }];

export default function Admin() {
  const [tab, setTab] = useState<Tab>("users");
  const toast = useToast();
  const soon = (what: string) => () => toast(`${what} arrives in the next build phase`, "err");
  const action = { users: ["Invite person", "Invites"], packages: ["New package", "Package editing"], dealers: ["Add dealer login", "Dealer editing"], audit: null }[tab];
  return (
    <>
      <PageHeader title="Admin" sub="People, catalog and the audit trail." actions={action ? <button className="btn btn-primary" onClick={soon(action[1])}>{action[0]}</button> : undefined} />
      <div role="tablist" className="mb-4 flex border-b border-line">{TABS.map((t) => <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
      {tab === "users" && (
        <div className="panel overflow-x-auto"><table className="tbl"><thead><tr><th>Name</th><th>Role</th><th>Team</th><th>Reports to</th><th>Status</th></tr></thead>
          <tbody>{USERS.map((u) => <tr key={u.id}><td><div className="font-medium">{u.name}</div><div className="text-[12px] text-faint">{u.email}</div></td><td>{ROLE_LABEL[u.role]}</td><td className="text-muted">{TEAMS.find((t) => t.id === u.teamId)?.name}</td><td className="text-muted">{u.id === u.managerId ? "—" : userById(u.managerId)?.name}</td>
            <td><span className="st" data-tone={u.status === "active" ? "success" : "neutral"}><i />{u.status === "active" ? "Active" : "Deactivated"}</span></td></tr>)}</tbody></table></div>)}
      {tab === "packages" && (
        <><div className="panel overflow-x-auto"><table className="tbl"><thead><tr><th>Package</th><th>Type</th><th className="r">Price / mo</th></tr></thead>
          <tbody>{PACKAGES.map((p) => <tr key={p.id}><td><span className="font-medium">{p.name}</span> <span className="mono text-faint">{p.code}</span></td><td className="capitalize text-muted">{p.category}</td><td className="r">{fmtMoney(p.price)}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-[12px] text-faint">Sample prices. Orders keep the price they were sold at.</p></>)}
      {tab === "dealers" && (
        <><div className="panel overflow-x-auto"><table className="tbl"><thead><tr><th>Login (username)</th><th>Label</th><th>Owner</th></tr></thead>
          <tbody>{DEALERS.map((d) => <tr key={d.id}><td className="mono">{d.login}</td><td>{d.label}</td><td className="text-muted">{d.owner}</td></tr>)}</tbody></table></div>
          <p className="mt-3 max-w-xl text-[12px] text-faint">Usernames only. Passwords are never stored in SalesOS.</p></>)}
      {tab === "audit" && <Audit />}
    </>
  );
}

function Audit() {
  const { allOrders, audit } = useStore();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const seeded = allOrders.slice(0, 150).flatMap((o) => o.history.filter((h) => h.kind !== "attention").slice(-2).map((h) => ({
      at: h.at, actor: h.actor, action: h.from === null && h.kind === "stage" ? "order.created" : "order.status_changed", entity: o.no, detail: h.kind === "stage" ? `${h.from ?? "—"} → ${h.to}` : `outcome → ${h.to}${h.reason ? ` (${h.reason})` : ""}` })));
    const live = audit.map((a) => ({ ...a, entity: allOrders.find((o) => o.id === a.entity)?.no ?? a.entity }));
    return [...live, ...seeded].sort((a, b) => b.at - a.at);
  }, [allOrders, audit]);
  const shown = rows.filter((r) => !q || `${r.action} ${r.entity} ${r.detail} ${userById(r.actor)?.name ?? r.actor}`.toLowerCase().includes(q.toLowerCase())).slice(0, 150);
  return (
    <div className="panel">
      <div className="p-3"><label className="sr-only" htmlFor="aq">Search audit log</label><input id="aq" className="input input-sm w-full sm:w-72" placeholder="Search person, action, order…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="max-h-[calc(100vh-340px)] overflow-auto border-t border-line">
        {shown.length === 0 ? <EmptyState title="No matching events." /> : (
          <table className="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
            <tbody>{shown.map((r, i) => <tr key={i}><td className="text-muted">{fmtDateTime(r.at)}</td><td>{r.actor === "System" ? "System" : userById(r.actor)?.name ?? r.actor}</td><td className="mono">{r.action}</td><td className="mono">{r.entity}</td><td className="text-muted">{r.detail}</td></tr>)}</tbody></table>)}
      </div>
    </div>
  );
}
