"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NOW, SEED_ORDERS, type Order, type Role } from "./mock";
import { actorFor, scopeOrders, type Actor } from "./permissions";

interface AuditRow { at: number; actor: string; action: string; entity: string; detail: string }
interface Store {
  role: Role; setRole: (r: Role) => void; actor: Actor;
  allOrders: Order[]; orders: Order[];
  addOrder: (o: Order) => void;
  changeStatus: (ids: string[], kind: "stage" | "outcome" | "reopen", to: string, reason: string) => void;
  addNote: (id: string, body: string) => void;
  logAudit: (a: Omit<AuditRow, "at">) => void;
  audit: AuditRow[];
  nextOrderNo: () => string;
  stamp: () => number; now: number;
  updateCustomer: (id: string, patch: Partial<Order["customer"]> & { line1?: string }, reason: string) => void;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => { const c = useContext(Ctx); if (!c) throw new Error("StoreProvider missing"); return c; };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("admin");
  const [allOrders, setAll] = useState<Order[]>(SEED_ORDERS);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [seq, setSeq] = useState(() => Math.max(...SEED_ORDERS.map((o) => Number(o.no.slice(4)))) + 1);

  useEffect(() => {
    try { const r = sessionStorage.getItem("salesos.role") as Role | null; if (r === "admin" || r === "manager" || r === "rep") setRoleState(r); } catch {}
  }, []);
  const setRole = useCallback((r: Role) => { setRoleState(r); try { sessionStorage.setItem("salesos.role", r); } catch {} }, []);
  const actor = useMemo(() => actorFor(role), [role]);
  const orders = useMemo(() => scopeOrders(actor, allOrders), [actor, allOrders]);
  const tickRef = useRef(0);
  const [tick, setTick] = useState(0);
  const stamp = useCallback(() => { tickRef.current += 1; setTick(tickRef.current); return NOW + 60_000 * tickRef.current; }, []);

  const logAudit = useCallback((a: Omit<AuditRow, "at">) => { const at = stamp(); setAudit((x) => [{ ...a, at }, ...x]); }, [stamp]);
  const addOrder = useCallback((o: Order) => { setAll((x) => [o, ...x]); setSeq((s) => s + 1); }, []);
  const nextOrderNo = useCallback(() => `TSH-${seq}`, [seq]);

  const changeStatus: Store["changeStatus"] = useCallback((ids, kind, to, reason) => {
    const at = stamp();
    setAll((all) => all.map((o) => {
      if (!ids.includes(o.id)) return o;
      const n: Order = { ...o, history: [...o.history], updatedAt: at };
      const who = actor.id;
      if (kind === "stage") {
        n.history.push({ at, kind: "stage", from: o.stage, to, actor: who, reason: reason || undefined });
        n.stage = to as Order["stage"];
        if (to === "installed") { n.installedAt = at; n.installDate = at; }
        if (to === "activated") n.activatedAt = at;
      } else if (kind === "outcome") {
        n.history.push({ at, kind: "outcome", from: null, to, actor: who, reason });
        n.outcome = to as Order["outcome"];
      } else {
        n.history.push({ at, kind: "outcome", from: o.outcome, to: null, actor: who, reason });
        n.outcome = null;
      }
      return n;
    }));
    logAudit({ actor: actor.id, action: "order.status_changed", entity: ids.length > 1 ? `${ids.length} orders` : ids[0], detail: `${kind} → ${to}${reason ? ` (${reason})` : ""}` });
  }, [actor.id, logAudit, stamp]);

  const addNote = useCallback((id: string, body: string) => {
    const at = stamp();
    setAll((all) => all.map((o) => (o.id === id ? { ...o, notes: [...o.notes, { at, author: actor.id, body }], updatedAt: at } : o)));
    logAudit({ actor: actor.id, action: "order.note_added", entity: id, detail: "Internal note added" });
  }, [actor.id, logAudit, stamp]);

  const updateCustomer: Store["updateCustomer"] = useCallback((id, patch, reason) => {
    const at = stamp();
    const { line1, ...cust } = patch;
    setAll((all) => all.map((o) => (o.id === id ? { ...o, updatedAt: at, customer: { ...o.customer, ...cust }, address: line1 ? { ...o.address, line1 } : o.address } : o)));
    logAudit({ actor: actor.id, action: "order.edited", entity: id, detail: `${Object.keys(patch).join(", ")} changed${reason ? ` (${reason})` : ""}` });
  }, [actor.id, logAudit, stamp]);

  const value = useMemo(() => ({ role, setRole, actor, allOrders, orders, addOrder, changeStatus, addNote, logAudit, audit, nextOrderNo, stamp, now: NOW + 60_000 * tick, updateCustomer }),
    [role, setRole, actor, allOrders, orders, addOrder, changeStatus, addNote, logAudit, audit, nextOrderNo, stamp, tick, updateCustomer]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
