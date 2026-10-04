import { DAY, NOW, startOfDay, TZ_OFFSET } from "./mock";

const tz = "America/New_York";
const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const df = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" });
const dfy = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });
const tf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

export const fmtDateTime = (t: number) => dtf.format(t);
export const fmtDate = (t: number) => df.format(t);
export const fmtDateY = (t: number) => dfy.format(t);
export const fmtTime = (t: number) => tf.format(t);
export const fmtInt = (n: number) => n.toLocaleString("en-US");
export const fmtPct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(n >= 0.995 || n === 0 ? 0 : 1)}%` : "—");
export const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const isoDate = (t: number) => new Date(t + TZ_OFFSET).toISOString().slice(0, 10);
export const parseIsoDate = (s: string) => Date.parse(s + "T00:00:00-04:00");

export function relTime(t: number) {
  const d = NOW - t;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < DAY) return `${Math.floor(d / 3_600_000)}h ago`;
  if (startOfDay(t) === startOfDay(NOW) - DAY) return "yesterday";
  return `${Math.floor(d / DAY)}d ago`;
}

export function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10})/, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function csvCell(v: string | number | null | undefined) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV formula-injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
