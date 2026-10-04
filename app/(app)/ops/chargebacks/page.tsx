"use client";
import { useStore } from "@/lib/store";
import { Queue } from "@/components/queue";
import { fmtDate } from "@/lib/format";

export default function Chargebacks() {
  const { orders } = useStore();
  const rows = orders.filter((o) => o.outcome === "chargeback").sort((a, b) => b.updatedAt - a.updatedAt);
  return <Queue title="Chargebacks" sub="chargebacks" rows={rows} extraLabel="Reason" empty="No chargebacks."
    extra={(o) => { const h = o.history.find((x) => x.to === "chargeback"); return h ? `${h.reason ?? "—"} (${fmtDate(h.at)})` : "—"; }} />;
}
