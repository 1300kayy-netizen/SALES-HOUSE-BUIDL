"use client";
import { useStore } from "@/lib/store";
import { Queue } from "@/components/queue";

export default function Exceptions() {
  const { orders } = useStore();
  const rows = orders.filter((o) => (o.attention && !o.outcome) || o.outcome === "failed").sort((a, b) => a.updatedAt - b.updatedAt);
  return <Queue title="Exceptions" sub="orders need review" rows={rows} extraLabel="Reason" extra={(o) => o.outcome === "failed" ? "Install failed" : o.attention} empty="Nothing needs attention." />;
}
