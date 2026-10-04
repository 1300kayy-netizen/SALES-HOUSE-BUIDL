import type { Order } from "./mock";
import { DAY, HOUR, NOW, startOfDay } from "./mock";
import { reachedActivated, isAwaitingInstall } from "./status";
import { fmtDate } from "./format";

export type RangeKey = "today" | "yesterday" | "week" | "month" | "custom";
export interface Range { key: RangeKey; start: number; end: number; label: string }

export function resolveRange(key: RangeKey, custom?: { from: number; to: number }): Range {
  const today = startOfDay(NOW);
  switch (key) {
    case "today": return { key, start: today, end: today + DAY, label: "Today" };
    case "yesterday": return { key, start: today - DAY, end: today, label: "Yesterday" };
    case "week": {
      const dow = (new Date(today + 12 * HOUR).getUTCDay() + 6) % 7; // Monday start
      return { key, start: today - dow * DAY, end: today + DAY, label: "This week" };
    }
    case "month": {
      const d = new Date(today + 12 * HOUR);
      const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) + 4 * HOUR;
      return { key, start: first, end: today + DAY, label: "This month" };
    }
    default: {
      const from = custom?.from ?? today - 6 * DAY, to = (custom?.to ?? today) + DAY;
      return { key: "custom", start: from, end: Math.max(to, from + DAY), label: "Custom" };
    }
  }
}
export const previousRange = (r: Range): Range => {
  const len = r.end - r.start;
  return { ...r, start: r.start - len, end: r.start };
};
const inR = (t: number, r: Range) => t >= r.start && t < r.end;

export interface Summary {
  submitted: number; installed: number; activated: number; activationRate: number; pending: number; cancelled: number;
  chargebacks: number; activeReps: number; fallout: number; falloutRate: number; awaitingInstall: number;
}

export function summarize(orders: Order[], r: Range): Summary {
  const cohort = orders.filter((o) => inR(o.submittedAt, r));
  const evt = (o: Order, kind: string, to: string[]) => o.history.some((h) => h.kind === kind && h.to !== null && to.includes(h.to) && inR(h.at, r));
  const installed = orders.filter((o) => evt(o, "stage", ["installed"])).length;
  const activated = cohort.filter(reachedActivated).length;
  const fallout = cohort.filter((o) => o.outcome === "cancelled" || o.outcome === "failed" || o.outcome === "duplicate").length;
  return {
    submitted: cohort.length, installed, activated,
    activationRate: cohort.length ? activated / cohort.length : NaN,
    pending: orders.filter((o) => !o.outcome && o.stage !== "installed" && o.stage !== "activated").length,
    cancelled: orders.filter((o) => evt(o, "outcome", ["cancelled"])).length,
    chargebacks: orders.filter((o) => evt(o, "outcome", ["chargeback"])).length,
    activeReps: new Set(cohort.map((o) => o.repId)).size,
    fallout, falloutRate: cohort.length ? fallout / Math.max(1, cohort.length) : NaN,
    awaitingInstall: orders.filter(isAwaitingInstall).length,
  };
}

export interface Bucket { label: string; start: number; submitted: number; installed: number }
export function trend(orders: Order[], r: Range): Bucket[] {
  const hourly = r.end - r.start <= DAY;
  const size = hourly ? HOUR : DAY;
  const from = hourly ? r.start + 8 * HOUR : r.start;
  const to = hourly ? r.start + 21 * HOUR : r.end;
  const buckets: Bucket[] = [];
  for (let t = from; t < to; t += size) {
    buckets.push({ start: t, label: hourly ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" }).format(t) : fmtDate(t), submitted: 0, installed: 0 });
  }
  const idx = (t: number) => Math.floor((t - from) / size);
  for (const o of orders) {
    const i = idx(o.submittedAt);
    if (i >= 0 && i < buckets.length) buckets[i].submitted++;
    for (const h of o.history) if (h.kind === "stage" && h.to === "installed") { const j = idx(h.at); if (j >= 0 && j < buckets.length) buckets[j].installed++; }
  }
  return buckets;
}

export interface RepStats { repId: string; submitted: number; installed: number; pending: number; cancelled: number; chargebacks: number; activated: number; activationRate: number; attachRate: number; perDay: number }
export function statsBy(orders: Order[], r: Range, key: (o: Order) => string): Map<string, RepStats> {
  const m = new Map<string, RepStats>();
  const days = Math.max(1, Math.round((Math.min(r.end, NOW + DAY) - r.start) / DAY));
  const get = (k: string) => m.get(k) ?? (m.set(k, { repId: k, submitted: 0, installed: 0, pending: 0, cancelled: 0, chargebacks: 0, activated: 0, activationRate: 0, attachRate: 0, perDay: 0 }), m.get(k)!);
  const attach = new Map<string, number>();
  for (const o of orders) {
    const k = key(o);
    if (inR(o.submittedAt, r)) {
      const s = get(k); s.submitted++;
      if (reachedActivated(o)) s.activated++;
      if (o.extras.includes("p6")) attach.set(k, (attach.get(k) ?? 0) + 1);
      if (!o.outcome && o.stage !== "installed" && o.stage !== "activated") s.pending++;
    }
    for (const h of o.history) {
      if (!inR(h.at, r)) continue;
      if (h.kind === "stage" && h.to === "installed") get(k).installed++;
      if (h.kind === "outcome" && h.to === "cancelled") get(k).cancelled++;
      if (h.kind === "outcome" && h.to === "chargeback") get(k).chargebacks++;
    }
  }
  for (const s of m.values()) {
    s.activationRate = s.submitted ? s.activated / s.submitted : 0;
    s.attachRate = s.submitted ? (attach.get(s.repId) ?? 0) / s.submitted : 0;
    s.perDay = s.submitted / days;
  }
  return m;
}
