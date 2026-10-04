"use client";
import { useStore } from "@/lib/store";
import { fmtDateTime } from "@/lib/format";
import { userById } from "@/lib/mock";
import { EmptyState, PageHeader } from "@/components/ui";
import Link from "next/link";

export default function Exports() {
  const { audit } = useStore();
  const rows = audit.filter((a) => a.action === "export.generated");
  return (
    <>
      <PageHeader title="Exports" sub="Every export is logged. Exports never include date of birth." actions={<Link href="/orders" className="btn no-underline">Export from Orders</Link>} />
      <div className="panel overflow-x-auto">
        {rows.length === 0 ? <EmptyState title="No exports yet." body="Use Export CSV on the Orders screen. Generated exports will be listed here." /> : (
          <table className="tbl"><thead><tr><th>When</th><th>By</th><th>Source</th><th>Detail</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{fmtDateTime(r.at)}</td><td>{userById(r.actor)?.name}</td><td>{r.entity}</td><td>{r.detail}</td></tr>)}</tbody></table>)}
      </div>
    </>
  );
}
