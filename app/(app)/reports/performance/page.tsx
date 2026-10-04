"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { statsBy } from "@/lib/metrics";
import { DEALERS, PACKAGES, TEAMS, userById } from "@/lib/mock";
import { fmtPct } from "@/lib/format";
import { PageHeader, Segmented } from "@/components/ui";
import { useRange } from "@/components/range";

type Dim = "rep" | "team" | "manager" | "package" | "dealer";
export default function Performance() {
  const { orders } = useStore();
  const { range, control } = useRange("month");
  const [dim, setDim] = useState<Dim>("team");
  const rows = useMemo(() => {
    const key = (o: (typeof orders)[number]) => ({ rep: o.repId, team: o.teamId, manager: o.managerId, package: o.packageId, dealer: o.dealerLogin })[dim];
    const name = (k: string) => ({ rep: userById(k)?.name, manager: userById(k)?.name, team: TEAMS.find((t) => t.id === k)?.name, package: PACKAGES.find((p) => p.id === k)?.name, dealer: DEALERS.find((d) => d.login === k)?.login }[dim] ?? k);
    return [...statsBy(orders, range, key).values()].map((s) => ({ name: name(s.repId), s })).sort((a, b) => b.s.submitted - a.s.submitted);
  }, [orders, range, dim]);
  return (
    <>
      <PageHeader title="Performance" sub={`${range.label} · grouped by ${dim}`} actions={control}>
        <div className="mt-3"><Segmented label="Group by" value={dim} onChange={setDim} options={[{ value: "team", label: "Team" }, { value: "manager", label: "Manager" }, { value: "rep", label: "Rep" }, { value: "package", label: "Package" }, { value: "dealer", label: "Dealer login" }]} /></div>
      </PageHeader>
      <div className="panel overflow-x-auto"><table className="tbl"><thead><tr><th>{dim[0].toUpperCase() + dim.slice(1)}</th><th className="r">Submitted</th><th className="r">Installed</th><th className="r">Pending</th><th className="r">Cancelled</th><th className="r">Chargebacks</th><th className="r">Activation %</th><th className="r">Fallout %</th></tr></thead>
        <tbody>{rows.map(({ name, s }) => <tr key={s.repId}><td>{name}</td><td className="r">{s.submitted}</td><td className="r">{s.installed}</td><td className="r">{s.pending}</td><td className="r">{s.cancelled}</td><td className="r">{s.chargebacks}</td><td className="r">{s.submitted ? fmtPct(s.activationRate) : "—"}</td><td className="r">{s.submitted ? fmtPct(s.cancelled / s.submitted) : "—"}</td></tr>)}</tbody></table></div>
    </>
  );
}
