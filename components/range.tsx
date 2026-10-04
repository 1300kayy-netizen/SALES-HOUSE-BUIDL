"use client";
import { useMemo, useState } from "react";
import { resolveRange, type Range, type RangeKey } from "@/lib/metrics";
import { Segmented } from "./ui";

const LABEL: Record<string, string> = { today: "Today", week: "Week", month: "Month" };
/** Range picker shared by Team / Reports / Rep profile. */
export function useRange(initial: RangeKey, keys: RangeKey[] = ["today", "week", "month"]) {
  const [key, setKey] = useState<RangeKey>(initial);
  const range: Range = useMemo(() => resolveRange(key), [key]);
  const control = <Segmented label="Date range" value={key} onChange={setKey} options={keys.map((k) => ({ value: k, label: LABEL[k] }))} />;
  return { range, control };
}
