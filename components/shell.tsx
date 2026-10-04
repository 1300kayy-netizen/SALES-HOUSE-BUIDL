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

interface Item { href: string; label: string; roles: Role[]; badge?: boolean }
const NAV: Item[] = [
  { href: "/", label: "Home", roles: ["admin", "manager", "rep"] },
  { href: "/orders", label: "Orders", roles: ["admin", "manager", "rep"], badge: true },
  { href: "/team", label: "Team", roles: ["admin", "manager", "rep"] },
  { href: "/reports", label: "Reports", roles: ["admin", "manager"] },
  { href: "/admin", label: "Admin", roles: ["admin"] },
];
const active = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/")) && !(href === "/orders" && path === "/orders/new");

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { role, setRole, orders, actor } = useStore();
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);

  const attention = useMemo(() => orders.filter((o) => o.attention && !o.outcome).length, [orders]);
  const items = NAV.filter((i) => i.roles.includes(role));
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

  const allowed = items.some((i) => active(path, i.href)) || path === "/orders/new" || path.startsWith("/orders/");
  useEffect(() => { if (!allowed) router.replace("/"); }, [allowed, router]);

  const nav = (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="px-4 pb-4 pt-5"><Brand /></div>
      <div className="px-3 pb-3">
        <Link href="/orders/new" className="btn btn-primary w-full" aria-keyshortcuts="n">New sale <span className="ml-auto rounded bg-white/20 px-1.5 text-[11px]">N</span></Link>
      </div>
      <div className="flex-1 px-3">
        {items.map((i) => {
          const on = active(path, i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={cn("mb-0.5 flex h-9 items-center justify-between rounded-lg px-3 no-underline transition-colors", on ? "bg-brand-bg font-medium text-ink" : "text-muted hover:bg-subtle hover:text-ink")}>
              <span className={on ? "text-brand" : ""}>{i.label === "Team" && role === "rep" ? "Leaderboard" : i.label}</span>
              {i.badge && attention > 0 && role !== "rep" && <span className="rounded-full bg-[var(--warn-bg)] px-1.5 text-[11px] font-semibold text-warn">{attention}</span>}
            </Link>
          );
        })}
      </div>
      <UserMenu name={me.name} role={role} setRole={setRole} />
    </nav>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 hidden w-[216px] border-r border-line bg-surface lg:block">{nav}</aside>
      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setMobileNav(false)} />
          <aside className="fade absolute inset-y-0 left-0 w-[260px] border-r border-line bg-surface">{nav}</aside>
        </div>
      )}
      <div className="min-w-0 lg:pl-[216px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-8">
          <button className="btn btn-sm lg:hidden" aria-label="Open menu" onClick={() => setMobileNav(true)}>Menu</button>
          <button onClick={() => setPalette(true)} aria-label="Search" className="flex h-9 min-w-0 flex-1 max-w-md items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-faint transition-colors hover:border-line-strong">
            <span className="flex-1 truncate">Search orders, customers, people…</span><span className="kbd hidden sm:inline">⌘K</span>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden items-center gap-2 text-[12px] text-muted md:inline-flex" title="Prototype: all data is generated sample data"><i className="live" />Live · demo data</span>
            <Link href="/orders/new" className="btn btn-sm btn-primary lg:hidden">New sale</Link>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">{children}</main>
      </div>
      <Palette open={palette} onClose={() => setPalette(false)} pages={items} />
    </div>
  );
}

function UserMenu({ name, role, setRole }: { name: string; role: Role; setRole: (r: Role) => void }) {
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(document.documentElement.dataset.theme !== "light"), []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next; setDark(!dark);
    try { localStorage.setItem("salesos.theme", next); } catch {}
  };
  return (
    <div className="border-t border-line p-3">
      <div className="mb-3 flex items-center gap-2.5">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-brand-bg text-[11px] font-semibold text-brand">{name.split(" ").map((p) => p[0]).join("")}</span>
        <div className="min-w-0 leading-[17px]"><div className="truncate font-medium">{name}</div><div className="text-[12px] text-muted">{ROLE_LABEL[role]}</div></div>
      </div>
      <label htmlFor="role-switch" className="eyebrow mb-1 block">View as</label>
      <select id="role-switch" className="input input-sm mb-2" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        <option value="admin">Admin</option><option value="manager">Manager</option><option value="rep">Sales rep</option>
      </select>
      <button className="btn btn-sm btn-ghost w-full justify-start px-1" onClick={toggle} aria-pressed={dark}>{dark ? "Switch to light" : "Switch to dark"}</button>
    </div>
  );
}

function Palette({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: Item[] }) {
  const { orders, role } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const acts = [{ key: "new", label: "New sale", hint: "Action", href: "/orders/new" }, ...pages.map((p) => ({ key: p.href, label: p.label, hint: "Go to", href: p.href }))];
    const pg = acts.filter((p) => !s || p.label.toLowerCase().includes(s));
    const ord = s.length < 2 ? [] : orders.filter((o) => o.no.toLowerCase().includes(s) || o.customer.name.toLowerCase().includes(s) || o.customer.phone.includes(s) || o.customer.email.includes(s)).slice(0, 6)
      .map((o) => ({ key: o.id, label: `${o.no} · ${o.customer.name}`, hint: statusOf(o).label, href: `/orders/${o.no}` }));
    return [...ord, ...pg].slice(0, 10);
  }, [q, pages, orders, role]);

  const go = (href: string) => { onClose(); router.push(href); };
  return (
    <Dialog open={open} onClose={onClose} title="Search" className="palette">
      <input ref={input} className="input" placeholder="Type an order number, name or phone…" aria-label="Search" value={q}
        onChange={(e) => { setQ(e.target.value); setI(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(v + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); }
          if (e.key === "Enter" && results[i]) go(results[i].href);
        }} />
      <ul role="listbox" aria-label="Results" className="m-0 mt-2 max-h-[320px] list-none overflow-y-auto p-0">
        {results.map((r, idx) => (
          <li key={r.key} role="option" aria-selected={idx === i}>
            <button className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left", idx === i && "bg-brand-bg")} onMouseEnter={() => setI(idx)} onClick={() => go(r.href)}>
              <span>{r.label}</span><span className="text-[12px] text-muted">{r.hint}</span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-6 text-center text-muted">No results.</li>}
      </ul>
    </Dialog>
  );
}
