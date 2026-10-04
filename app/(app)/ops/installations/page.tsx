"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { NOW } from "@/lib/mock";
import { fmtDate } from "@/lib/format";
import { isAwaitingInstall } from "@/lib/status";
import { Queue } from "@/components/queue";
import { Segmented } from "@/components/ui";

export default function Installations() {
  const { orders } = useStore();
  const [v, setV] = useState<"all" | "scheduled" | "overdue">("all");
  const rows = orders.filter(isAwaitingInstall).filter((o) => v === "all" || (v === "scheduled" ? o.stage === "scheduled" : !!o.installDate && o.installDate < NOW)).sort((a, b) => (a.installDate ?? Infinity) - (b.installDate ?? Infinity));
  return <Queue title="Installations" sub="orders awaiting install" rows={rows} extraLabel="Install date" empty="No orders are awaiting install."
    extra={(o) => o.installDate ? <span style={o.installDate < NOW ? { color: "var(--bad)" } : undefined}>{fmtDate(o.installDate)}{o.installDate < NOW ? " · overdue" : ""}</span> : <span className="text-faint">Not scheduled</span>}
    actions={<Segmented label="View" value={v} onChange={setV} options={[{ value: "all", label: "All" }, { value: "scheduled", label: "Scheduled" }, { value: "overdue", label: "Overdue" }]} />} />;
}
