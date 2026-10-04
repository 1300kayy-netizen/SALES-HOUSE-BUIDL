"use client";
import { PACKAGES } from "@/lib/mock";
import { fmtMoney } from "@/lib/format";
import { PageHeader, useToast } from "@/components/ui";

export default function Packages() {
  const toast = useToast();
  return (
    <>
      <PageHeader title="Packages" sub="Catalog with effective-dated pricing. Orders snapshot the package and price at sale." actions={<button className="btn btn-primary" onClick={() => toast("Package editing arrives in Phase 3", "err")}>New package</button>} />
      <div className="panel overflow-x-auto"><table className="tbl"><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Provider</th><th className="r">Price / mo</th><th>Status</th></tr></thead>
        <tbody>{PACKAGES.map((p) => <tr key={p.id}><td className="mono">{p.code}</td><td>{p.name}</td><td className="capitalize">{p.category}</td><td>Xfinity</td><td className="r">{fmtMoney(p.price)}</td><td><span className="st" data-tone="success"><i />Active</span></td></tr>)}</tbody></table></div>
      <p className="mt-3 text-[12px] text-faint">Prices shown are placeholder sample values.</p>
    </>
  );
}
