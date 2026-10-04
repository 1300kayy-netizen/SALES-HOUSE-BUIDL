"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { statsBy } from "@/lib/metrics";
import { DEALERS, PACKAGES, TEAMS, userById } from "@/lib/mock";
import { fmtPct } from "@/lib/format";
import { PageHeader, Segmented } from "@/components/ui";
import { useRange } from "@/components/range";

type Dim = "team" | "rep" | "package" | "dealer";
const DIMS: { value: Dim; label: string }[] = [{ value: "team", label: "Team" }, { value: "rep", label: "Rep" }, { value: "package", label: "Package" }, { value: "dealer", label: "Dealer login" }];

export default function Reports() {
  const { orders } = useStore();
  const { range, control } = useRange("month", ["week", "month"]);
  const [dim, setDim] = useState<Dim>("team");
  const rows = useMemo(() => {
    const key = (o: (typeof orders)[number]) => ({ rep: o.repId, team: o.teamId, package: o.packageId, dealer: o.dealerLogin })[dim];
    const name = (k: string) => ({ rep: userById(k)?.name, team: TEAMS.find((t) => t.id === k)?.name, package: PACKAGES.find((p) => p.id === k)?.name, dealer: DEALERS.find((d) => d.login === k)?.login })[dim] ?? k;
    return [...statsBy(orders, range, key).values()].map((s) => ({ name: name(s.repId), s })).sort((a, b) => b.s.submitted - a.s.submitted);
  }, [orders, range, dim]);
  const total = rows.reduce((a, r) => a + r.s.submitted, 0);
  return (
    <>
      <PageHeader title="Reports" sub="Compare performance across the business." actions={control} />
      <div className="mb-4"><Segmented label="Group by" value={dim} onChange={setDim} options={DIMS} /></div>
      <div className="panel overflow-x-auto"><table className="tbl">
        <thead><tr><th>{DIMS.find((d) => d.value === dim)?.label}</th><th className="r">Submitted</th><th className="r">Share</th><th className="r">Installed</th><th className="r">Activation</th><th className="r">Cancelled</th><th className="r">Chargebacks</th></tr></thead>
        <tbody>{rows.map(({ name, s }) => (
          <tr key={s.repId}><td className="font-medium">{name}</td><td className="r">{s.submitted}</td>
            <td className="r"><span className="inline-flex items-center gap-2"><span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-subtle"><span className="block h-full rounded-full" style={{ width: `${total ? (s.submitted / total) * 100 : 0}%`, background: "var(--brand-solid)" }} /></span><span className="w-10 text-muted">{fmtPct(total ? s.submitted / total : 0)}</span></span></td>
            <td className="r">{s.installed}</td><td className="r">{s.submitted ? fmtPct(s.activationRate) : "—"}</td><td className="r">{s.cancelled}</td><td className="r">{s.chargebacks}</td></tr>))}</tbody></table></div>
      <p className="mt-3 text-[12px] text-faint">Commission reporting arrives with the commission module.</p>
    </>
  );
}
