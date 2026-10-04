"use client";
import { useMemo, useState } from "react";
import { resolveRange, type Range, type RangeKey } from "@/lib/metrics";
import { DAY, NOW, startOfDay } from "@/lib/mock";
import { isoDate, parseIsoDate } from "@/lib/format";
import { Segmented } from "./ui";

/** Range picker shared by Leaderboard / Performance / Rep profile. */
export function useRange(initial: RangeKey, keys: RangeKey[] = ["today", "week", "month", "custom"]) {
  const [key, setKey] = useState<RangeKey>(initial);
  const [from, setFrom] = useState(isoDate(startOfDay(NOW) - 6 * DAY));
  const [to, setTo] = useState(isoDate(startOfDay(NOW)));
  const range: Range = useMemo(() => resolveRange(key, { from: parseIsoDate(from), to: parseIsoDate(to) }), [key, from, to]);
  const LABEL: Record<RangeKey, string> = { today: "Today", yesterday: "Yesterday", week: "Week", month: "Month", custom: "Custom" };
  const control = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Date range" value={key} onChange={setKey} options={keys.map((k) => ({ value: k, label: LABEL[k] }))} />
      {key === "custom" && <>
        <label className="sr-only" htmlFor="r-from">From</label><input id="r-from" type="date" className="input input-sm w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-muted">to</span>
        <label className="sr-only" htmlFor="r-to">To</label><input id="r-to" type="date" className="input input-sm w-auto" value={to} min={from} max={isoDate(startOfDay(NOW))} onChange={(e) => setTo(e.target.value)} />
      </>}
    </div>
  );
  return { range, control };
}
