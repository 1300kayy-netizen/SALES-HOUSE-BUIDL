"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/permissions";
import { USERS, type Role } from "@/lib/mock";
import { cn, Dialog } from "./ui";
import { Brand } from "./brand";
import { statusOf } from "@/lib/status";

interface Item { href: string; label: string; roles: Role[]; badge?: "exceptions" }
interface Group { label?: string; items: Item[] }
const ALL: Role[] = ["admin", "manager", "rep"];
const AM: Role[] = ["admin", "manager"];
const NAV: Group[] = [
  { items: [{ href: "/", label: "Overview", roles: ALL }] },
  { label: "Sales", items: [{ href: "/orders", label: "Orders", roles: ALL }, { href: "/orders/new", label: "Submit Sale", roles: ALL }] },
  { label: "Team", items: [
    { href: "/team/representatives", label: "Representatives", roles: AM }, { href: "/team/teams", label: "Teams", roles: AM },
    { href: "/team/leaderboard", label: "Leaderboard", roles: ALL } ] },
  { label: "Operations", items: [
    { href: "/ops/exceptions", label: "Exceptions", roles: AM, badge: "exceptions" }, { href: "/ops/installations", label: "Installations", roles: AM },
    { href: "/ops/chargebacks", label: "Chargebacks", roles: AM } ] },
  { label: "Reporting", items: [
    { href: "/reports/performance", label: "Performance", roles: AM }, { href: "/reports/commissions", label: "Commissions", roles: AM },
    { href: "/reports/exports", label: "Exports", roles: AM } ] },
  { label: "Admin", items: [
    { href: "/admin/packages", label: "Packages", roles: ["admin"] }, { href: "/admin/dealer-accounts", label: "Dealer Accounts", roles: ["admin"] },
    { href: "/admin/users", label: "Users", roles: ["admin"] }, { href: "/admin/audit", label: "Audit Log", roles: ["admin"] },
    { href: "/admin/settings", label: "Settings", roles: ["admin"] } ] },
];

const active = (path: string, href: string) => (href === "/" ? path === "/" : path === href || (path.startsWith(href + "/") && !(href === "/orders" && path === "/orders/new")));

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { role, setRole, orders, actor } = useStore();
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const router = useRouter();

  const exceptions = useMemo(() => orders.filter((o) => o.attention && !o.outcome).length, [orders]);
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length);
  const me = USERS.find((u) => u.id === actor.id)!;

  useEffect(() => setMobileNav(false), [path]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); }
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key === "n") { e.preventDefault(); router.push("/orders/new"); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [router]);

  // Route guard (prototype): out-of-scope pages bounce to Overview
  const allowed = groups.some((g) => g.items.some((i) => active(path, i.href))) || path.startsWith("/orders/") || path.startsWith("/team/representatives/");
  useEffect(() => { if (!allowed) router.replace("/"); }, [allowed, router]);

  const crumbs = path === "/" ? ["Overview"] : path.split("/").filter(Boolean).map((s) => (/^[a-z-]+$/.test(s) ? s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : s));

  const nav = (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-4"><Brand /></div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((g, gi) => (
          <div key={gi} className="mb-3">
            {g.label && <div className="eyebrow px-2 pb-1 pt-2">{g.label}</div>}
            {g.items.map((i) => {
              const on = active(path, i.href);
              return (
                <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
                  className={cn("relative flex h-8 items-center justify-between rounded-md px-2.5 no-underline transition-colors", on ? "bg-brand-bg font-medium text-brand" : "text-ink hover:bg-subtle")}>
                  {on && <span className="absolute -left-2 top-1.5 h-5 w-0.5 rounded bg-brand" />}
                  {i.label}
                  {i.badge === "exceptions" && exceptions > 0 && <span className="rounded bg-subtle px-1.5 text-[11px] font-semibold text-muted">{exceptions}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <UserMenu name={me.name} role={role} setRole={setRole} />
    </nav>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 hidden w-[232px] border-r border-line bg-surface lg:block">{nav}</aside>
      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
          <aside className="fade absolute inset-y-0 left-0 w-[260px] border-r border-line bg-surface">{nav}</aside>
        </div>
      )}
      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-0 sm:px-6">
          <button className="btn btn-sm lg:hidden" aria-label="Open menu" onClick={() => setMobileNav(true)}>Menu</button>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-muted sm:flex">
            <span>SalesOS</span>{crumbs.map((c, i) => <span key={i} className="flex items-center gap-1.5"><span className="text-faint">/</span><span className={i === crumbs.length - 1 ? "text-ink" : ""}>{c}</span></span>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded border border-line px-2 py-0.5 text-[11px] font-medium text-muted md:inline" title="All data on this site is generated sample data">Prototype · sample data</span>
            <button className="btn btn-sm gap-2 text-muted" onClick={() => setPalette(true)} aria-label="Open command palette">
              <span>Search</span><span className="kbd">⌘K</span>
            </button>
            {path !== "/orders/new" && <Link href="/orders/new" className="btn btn-sm btn-primary no-underline">Submit sale</Link>}
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">{children}</main>
      </div>
      <Palette open={palette} onClose={() => setPalette(false)} groups={groups} />
    </div>
  );
}

function UserMenu({ name, role, setRole }: { name: string; role: Role; setRole: (r: Role) => void }) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next; setDark(!dark);
    try { localStorage.setItem("salesos.theme", next); } catch {}
  };
  return (
    <div className="border-t border-line p-3">
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-brand-bg text-[11px] font-semibold text-brand">{name.split(" ").map((p) => p[0]).join("")}</span>
        <div className="min-w-0"><div className="truncate font-medium leading-4">{name}</div><div className="text-[12px] leading-4 text-muted">{ROLE_LABEL[role]}</div></div>
      </div>
      <label htmlFor="role-switch" className="eyebrow mb-1 block">Demo role</label>
      <select id="role-switch" className="input input-sm mb-2" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        <option value="admin">Admin — Dana Whitfield</option><option value="manager">Manager — Marcus Reyes</option><option value="rep">Sales Rep — Joshua Park</option>
      </select>
      <button className="btn btn-sm w-full" onClick={toggle}>{dark ? "Light theme" : "Dark theme"}</button>
    </div>
  );
}

function Palette({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: Group[] }) {
  const { orders } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = groups.flatMap((g) => g.items.map((x) => ({ key: x.href, label: x.label, hint: g.label ?? "Go to", href: x.href })));
    const pg = pages.filter((p) => !s || p.label.toLowerCase().includes(s));
    const ord = s.length < 2 ? [] : orders.filter((o) => o.no.toLowerCase().includes(s) || o.customer.name.toLowerCase().includes(s) || o.customer.phone.includes(s) || o.customer.email.includes(s)).slice(0, 6)
      .map((o) => ({ key: o.id, label: `${o.no} · ${o.customer.name}`, hint: statusOf(o).label, href: `/orders/${o.no}` }));
    return [...ord, ...pg].slice(0, 12);
  }, [q, groups, orders]);

  const go = (href: string) => { onClose(); router.push(href); };
  return (
    <Dialog open={open} onClose={onClose} title="Command palette" className="palette">
      <input ref={input} className="input" placeholder="Search orders, customers, pages…" aria-label="Search" value={q}
        onChange={(e) => { setQ(e.target.value); setI(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(v + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); }
          if (e.key === "Enter" && results[i]) go(results[i].href);
        }} />
      <ul role="listbox" aria-label="Results" className="m-0 mt-2 max-h-[320px] list-none overflow-y-auto p-0">
        {results.map((r, idx) => (
          <li key={r.key} role="option" aria-selected={idx === i}>
            <button className={cn("flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left", idx === i && "bg-brand-bg")} onMouseEnter={() => setI(idx)} onClick={() => go(r.href)}>
              <span>{r.label}</span><span className="text-[12px] text-muted">{r.hint}</span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-2.5 py-6 text-center text-muted">No results.</li>}
      </ul>
    </Dialog>
  );
}
