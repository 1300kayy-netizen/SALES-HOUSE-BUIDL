// PROTOTYPE ONLY — deterministic fake data. Deleted in Phase 3 (see docs/SALESOS_PLAN.md).
export type Stage = "submitted" | "processing" | "pending" | "scheduled" | "installed" | "activated";
export type Outcome = "cancelled" | "failed" | "duplicate" | "chargeback";
export type Role = "admin" | "manager" | "rep";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
// Prototype "now": Sun-Oct-4-2026 16:30 EDT. Fixed so server and client render identically.
export const NOW = Date.parse("2026-10-04T16:30:00-04:00");
export const TZ_OFFSET = -4 * HOUR;
export const startOfDay = (t: number) => Math.floor((t + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET;

export const STAGES: Stage[] = ["submitted", "processing", "pending", "scheduled", "installed", "activated"];

export interface Team { id: string; name: string; managerId: string; market: string }
export interface Rep { id: string; name: string; email: string; role: Role; teamId: string; managerId: string; market: string; status: "active" | "inactive"; startDate: number; phone: string }
export interface Pkg { id: string; code: string; name: string; category: "internet" | "mobile" | "tv" | "voice"; price: number }
export interface DealerAccount { id: string; login: string; label: string; owner: string }
export interface HistoryEntry { at: number; kind: "stage" | "outcome" | "attention"; from: string | null; to: string | null; actor: string; reason?: string; note?: string }
export interface Note { at: number; author: string; body: string }
export interface Order {
  id: string; no: string; submittedAt: number; updatedAt: number;
  repId: string; teamId: string; managerId: string; market: string;
  customer: { name: string; email: string; phone: string; dob: string; dobYear: number };
  address: { line1: string; unit: string; city: string; state: string; zip: string };
  packageId: string; extras: string[]; dealerLogin: string; zoeyNo: string | null;
  stage: Stage; outcome: Outcome | null; attention: string | null;
  installDate: number | null; activatedAt: number | null; installedAt: number | null;
  source: "manual" | "import" | "api"; duplicateOf: string[];
  history: HistoryEntry[]; notes: Note[];
}

export const TEAMS: Team[] = [
  { id: "t1", name: "Alpha", managerId: "m1", market: "Philadelphia" },
  { id: "t2", name: "Bravo", managerId: "m2", market: "Atlanta" },
  { id: "t3", name: "Charlie", managerId: "m3", market: "Houston" },
];

const mk = (id: string, name: string, role: Role, teamId: string, managerId: string, market: string, startDays: number, status: "active" | "inactive" = "active"): Rep => ({
  id, name, role, teamId, managerId, market, status, startDate: startOfDay(NOW - startDays * DAY),
  email: name.toLowerCase().replace(/[^a-z ]/g, "").replace(" ", ".") + "@thesaleshouse.example",
  phone: "(555) 555-01" + String(10 + (id.charCodeAt(1) * 7) % 80).padStart(2, "0"),
});

export const USERS: Rep[] = [
  mk("a1", "Dana Whitfield", "admin", "t1", "a1", "Philadelphia", 900),
  mk("m1", "Marcus Reyes", "manager", "t1", "a1", "Philadelphia", 640),
  mk("m2", "Priya Raman", "manager", "t2", "a1", "Atlanta", 520),
  mk("m3", "Tom Okafor", "manager", "t3", "a1", "Houston", 410),
  mk("r1", "Joshua Park", "rep", "t1", "m1", "Philadelphia", 300),
  mk("r2", "Billy Navarro", "rep", "t1", "m1", "Philadelphia", 210),
  mk("r3", "Aisha Coleman", "rep", "t1", "m1", "Philadelphia", 150),
  mk("r4", "Lucas Brandt", "rep", "t1", "m1", "Philadelphia", 40),
  mk("r5", "Sofia Marchetti", "rep", "t2", "m2", "Atlanta", 380),
  mk("r6", "Derek Osei", "rep", "t2", "m2", "Atlanta", 260),
  mk("r7", "Hannah Weiss", "rep", "t2", "m2", "Atlanta", 120),
  mk("r8", "Miguel Alvarado", "rep", "t2", "m2", "Atlanta", 75),
  mk("r9", "Keisha Monroe", "rep", "t3", "m3", "Houston", 330),
  mk("r10", "Ravi Shah", "rep", "t3", "m3", "Houston", 190),
  mk("r11", "Elena Petrova", "rep", "t3", "m3", "Houston", 95),
  mk("r12", "Caleb Dunn", "rep", "t3", "m3", "Houston", 30),
  mk("r13", "Tasha Greene", "rep", "t1", "m1", "Philadelphia", 500, "inactive"),
];
export const REPS = USERS.filter((u) => u.role === "rep");
export const userById = (id: string) => USERS.find((u) => u.id === id);

export const PACKAGES: Pkg[] = [
  { id: "p1", code: "XF-CONNECT", name: "Connect 75 Mbps", category: "internet", price: 30 },
  { id: "p2", code: "XF-FAST", name: "Fast 300 Mbps", category: "internet", price: 55 },
  { id: "p3", code: "XF-SUPER", name: "Superfast 800 Mbps", category: "internet", price: 70 },
  { id: "p4", code: "XF-GIG", name: "Gigabit 1 Gbps", category: "internet", price: 80 },
  { id: "p5", code: "XF-GIGX", name: "Gigabit Extra 1.2 Gbps", category: "internet", price: 95 },
  { id: "p6", code: "XF-MOB", name: "Mobile Unlimited Line", category: "mobile", price: 40 },
  { id: "p7", code: "XF-TV", name: "Streaming TV Select", category: "tv", price: 45 },
  { id: "p8", code: "XF-VOICE", name: "Home Voice", category: "voice", price: 20 },
];
export const INTERNET_PACKAGES = PACKAGES.filter((p) => p.category === "internet");
export const pkgById = (id: string) => PACKAGES.find((p) => p.id === id)!;

export const DEALERS: DealerAccount[] = [
  { id: "d1", login: "tsh_philly_01", label: "Philadelphia Primary", owner: "Marcus Reyes" },
  { id: "d2", login: "tsh_philly_02", label: "Philadelphia Events", owner: "Marcus Reyes" },
  { id: "d3", login: "tsh_atl_01", label: "Atlanta Primary", owner: "Priya Raman" },
  { id: "d4", login: "tsh_atl_02", label: "Atlanta Retail Kiosk", owner: "Priya Raman" },
  { id: "d5", login: "tsh_hou_01", label: "Houston Primary", owner: "Tom Okafor" },
];
const dealerFor = (market: string, r: () => number) => {
  const pool = DEALERS.filter((d) => d.login.includes(market === "Philadelphia" ? "philly" : market === "Atlanta" ? "atl" : "hou"));
  return pool[Math.floor(r() * pool.length)].login;
};

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

const FIRST = ["Maria", "James", "Linda", "Robert", "Patricia", "Michael", "Jennifer", "David", "Susan", "Daniel", "Karen", "Anthony", "Nancy", "Kevin", "Angela", "Brian", "Rachel", "Eric", "Monica", "Gregory", "Denise", "Samuel", "Olivia", "Nathan", "Yolanda", "Victor"];
const LAST = ["Santos", "Whitaker", "Nguyen", "Patel", "Hernandez", "Okonkwo", "Fischer", "Bishop", "Delgado", "Kowalski", "Brooks", "Tran", "Ramirez", "Sutton", "Lindqvist", "Mwangi", "Foster", "Castillo", "Abbott", "Yamamoto", "Pierce", "Rhodes"];
const STREETS = ["Maple Grove Ln", "Oak Hollow Dr", "Cedar St", "Elm Ave", "Lakeview Blvd", "Willow Creek Rd", "Sunset Pkwy", "Park Ridge Ct", "Highland Ave", "Magnolia Way", "Birchwood Dr", "Riverside Terrace"];
const CITIES: Record<string, [string, string, string][]> = {
  Philadelphia: [["Philadelphia", "PA", "191"], ["Cherry Hill", "NJ", "080"], ["Norristown", "PA", "194"]],
  Atlanta: [["Atlanta", "GA", "303"], ["Marietta", "GA", "300"], ["Decatur", "GA", "300"]],
  Houston: [["Houston", "TX", "770"], ["Katy", "TX", "774"], ["Pasadena", "TX", "775"]],
};

const AREA: Record<string, string> = { Philadelphia: "215", Atlanta: "404", Houston: "713" };
const ATTENTION = ["Address could not be verified", "Customer unreachable for install scheduling", "Zoey order number missing", "Possible duplicate — review needed", "Install appointment missed"];
const ACTORS_SYS = "System";

function buildOrders(): Order[] {
  const r = rng(20261004);
  const out: Order[] = [];
  const DAYS = 75;
  let n = 10001;
  const all: { t: number; rep: Rep }[] = [];
  for (let d = DAYS; d >= 0; d--) {
    const dayStart = startOfDay(NOW) - d * DAY;
    const dow = new Date(dayStart + 12 * HOUR).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    for (const rep of REPS) {
      if (rep.startDate > dayStart + DAY) continue;
      if (rep.status === "inactive" && d < 20) continue;
      const skill = 0.55 + ((rep.id.charCodeAt(1) * 13 + rep.id.length * 7) % 10) / 10;
      const mean = (weekend ? 0.7 : 1.5) * skill;
      let k = 0;
      let p = Math.exp(-mean), s = p, u = r();
      while (u > s && k < 8) { k++; p *= mean / k; s += p; }
      for (let i = 0; i < k; i++) {
        const t = dayStart + (9 + r() * 10) * HOUR;
        if (t <= NOW) all.push({ t, rep });
      }
    }
  }
  all.sort((a, b) => a.t - b.t);
  const dupePool: Order[] = [];
  for (const { t, rep } of all) {
    const ageDays = (NOW - t) / DAY;
    const first = pick(r, FIRST), last = pick(r, LAST);
    const [city, state, zipPrefix] = pick(r, CITIES[rep.market]);
    const pkg = INTERNET_PACKAGES[Math.floor(Math.pow(r(), 1.3) * INTERNET_PACKAGES.length)];
    const extras: string[] = [];
    if (r() < 0.28) extras.push("p6");
    if (r() < 0.1) extras.push("p7");
    const by = 1955 + Math.floor(r() * 50);
    const dob = `${String(1 + Math.floor(r() * 12)).padStart(2, "0")}/${String(1 + Math.floor(r() * 28)).padStart(2, "0")}/${by}`;
    const o: Order = {
      id: "o" + n, no: "TSH-" + n, submittedAt: t, updatedAt: t,
      repId: rep.id, teamId: rep.teamId, managerId: rep.managerId, market: rep.market,
      customer: {
        name: `${first} ${last}`, email: `${first}.${last}${Math.floor(r() * 90)}@example.com`.toLowerCase(),
        phone: `(${AREA[rep.market]}) 555-01${String(Math.floor(r() * 100)).padStart(2, "0")}`,
        dob, dobYear: by,
      },
      address: { line1: `${100 + Math.floor(r() * 8900)} ${pick(r, STREETS)}`, unit: r() < 0.25 ? `Apt ${1 + Math.floor(r() * 40)}` : "", city, state, zip: zipPrefix + String(10 + Math.floor(r() * 89)) },
      packageId: pkg.id, extras, dealerLogin: dealerFor(rep.market, r), zoeyNo: r() < 0.82 ? "ZY" + (4000000 + Math.floor(r() * 999999)) : null,
      stage: "submitted", outcome: null, attention: null, installDate: null, activatedAt: null, installedAt: null,
      source: "manual", duplicateOf: [], history: [{ at: t, kind: "stage", from: null, to: "submitted", actor: rep.name }], notes: [],
    };
    // Lifecycle: simulate progression based on age
    let cur = t;
    const step = (to: Stage, hoursLater: number, actor: string) => {
      const prev = o.stage; const next = cur + hoursLater * HOUR;
      if (next > NOW) return false;
      cur = next;
      o.history.push({ at: cur, kind: "stage", from: prev, to, actor }); o.stage = to; return true;
    };
    const stageNow = (): Stage => o.stage;
    const mgr = userById(rep.managerId)!.name;
    const roll = r();
    const fate = roll < 0.08 ? "cancelled" : roll < 0.11 ? "failed" : roll < 0.125 ? "duplicate" : "ok";
    if (step("processing", 0.3 + r() * 3, mgr) && step("pending", 2 + r() * 20, ACTORS_SYS)) {
      if (fate === "ok" || r() < 0.5) {
        if (step("scheduled", 6 + r() * 30, mgr)) {
          o.installDate = cur + (18 + r() * 54) * HOUR;
          if (o.installDate <= NOW) {
            cur = o.installDate;
            if (r() < 0.9) {
              o.history.push({ at: cur, kind: "stage", from: "scheduled", to: "installed", actor: ACTORS_SYS }); o.stage = "installed"; o.installedAt = cur;
              if (r() < 0.82) { step("activated", 4 + r() * 20, ACTORS_SYS); if (stageNow() === "activated") o.activatedAt = cur; }
            }
          }
        }
      }
    }
    if (fate !== "ok" && ageDays > 0.1) {
      const at = Math.min(NOW - HOUR, cur + (1 + r() * 30) * HOUR);
      if (at > t) {
        o.outcome = fate as Outcome;
        o.history.push({ at, kind: "outcome", from: null, to: fate, actor: fate === "duplicate" ? mgr : rep.name, reason: fate === "cancelled" ? pick(r, ["Customer changed mind", "Credit check declined", "Moved out"]) : fate === "failed" ? "Install not possible at address" : "Matches earlier order" });
        cur = at;
      }
    }
    if (!o.outcome && (stageNow() === "installed" || stageNow() === "activated") && ageDays > 14 && r() < 0.05) {
      const at = Math.min(NOW - HOUR, cur + (5 + r() * 12) * DAY);
      o.outcome = "chargeback"; o.history.push({ at, kind: "outcome", from: null, to: "chargeback", actor: "System", reason: "Account disconnected inside chargeback window" }); cur = at;
    }
    if (!o.outcome && stageNow() !== "installed" && stageNow() !== "activated" && (r() < 0.07 || (ageDays > 6 && stageNow() === "pending"))) {
      o.attention = pick(r, ATTENTION);
      const at = Math.min(NOW - HOUR, cur + 2 * HOUR);
      o.history.push({ at: Math.max(at, t + HOUR / 2), kind: "attention", from: null, to: "flagged", actor: ACTORS_SYS, reason: o.attention }); cur = Math.max(cur, at);
    }
    o.updatedAt = Math.max(cur, t);
    if (stageNow() === "installed" || stageNow() === "activated") o.installDate = o.installedAt;
    if (r() < 0.03) { o.notes.push({ at: t + HOUR, author: rep.name, body: "Customer prefers morning install window." }); }
    if (r() < 0.04) dupePool.push(o);
    out.push(o); n++;
  }
  // Seed deliberate duplicates (same address as an earlier order) for demos
  for (const src of dupePool.slice(0, 6)) {
    const later = out.find((x) => x.submittedAt > src.submittedAt + 3 * DAY && x.market === src.market && !x.outcome && x.stage !== "activated");
    if (later) { later.address = { ...src.address }; later.duplicateOf = [src.no]; later.attention = later.attention ?? "Possible duplicate — review needed"; }
  }
  // Demo order used by the duplicate sample button
  const demo = out.find((x) => x.market === "Philadelphia" && x.submittedAt > NOW - 5 * DAY);
  if (demo) {
    demo.customer = { ...demo.customer, name: "Maria Santos", email: "maria.santos@example.com", phone: "(215) 555-0142" };
    demo.address = { line1: "412 Maple Grove Ln", unit: "Apt 3", city: "Philadelphia", state: "PA", zip: "19104" };
  }
  return out.reverse();
}

export const SEED_ORDERS: Order[] = buildOrders();
export const DEMO_DUPLICATE = { name: "Maria Santos", email: "maria.santos@example.com", phone: "(215) 555-0142", line1: "412 Maple Grove Ln", unit: "Apt 3", city: "Philadelphia", state: "PA", zip: "19104" };
