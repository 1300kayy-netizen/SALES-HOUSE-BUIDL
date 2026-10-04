import type { Order, Role } from "./mock";
import { USERS } from "./mock";

export interface Actor { id: string; role: Role; teamId: string }

export const actorFor = (role: Role): Actor => {
  const u = USERS.find((x) => x.id === { admin: "a1", manager: "m1", rep: "r1" }[role])!;
  return { id: u.id, role, teamId: u.teamId };
};

/** Prototype of the server-side scope filter. Production applies this in SQL + RLS. */
export const canSee = (a: Actor, o: Order) => a.role === "admin" || (a.role === "manager" ? o.managerId === a.id : o.repId === a.id);
export const scopeOrders = (a: Actor, orders: Order[]) => orders.filter((o) => canSee(a, o));

export const can = {
  revealDob: (r: Role) => r === "admin" || r === "manager",
  changeStatus: (r: Role) => r !== "rep",
  viewAudit: (r: Role) => r === "admin",
  exportData: (r: Role) => r !== "rep",
  manageAdmin: (r: Role) => r === "admin",
  viewTeam: (r: Role) => r !== "rep",
  viewOps: (r: Role) => r !== "rep",
  viewReports: (r: Role) => r !== "rep",
};

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", rep: "Sales Rep" };
