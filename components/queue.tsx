"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Order } from "@/lib/mock";
import { pkgById, userById } from "@/lib/mock";
import { fmtDate, fmtDateTime, relTime } from "@/lib/format";
import { EmptyState, PageHeader, Status } from "./ui";

/** Shared work-queue table for Exceptions / Installations / Chargebacks. */
export function Queue({ title, sub, rows, extra, extraLabel, empty, actions }: { title: string; sub: string; rows: Order[]; extra: (o: Order) => ReactNode; extraLabel: string; empty: string; actions?: ReactNode }) {
  return (
    <>
      <PageHeader title={title} sub={`${rows.length} ${sub}`} actions={actions} />
      <div className="panel overflow-x-auto">
        {rows.length === 0 ? <EmptyState title={empty} /> : (
          <table className="tbl"><caption className="sr-only">{title}</caption>
            <thead><tr><th>Order</th><th>Submitted</th><th>Agent</th><th>Customer</th><th>Package</th><th>Status</th><th>{extraLabel}</th><th>Updated</th></tr></thead>
            <tbody>{rows.slice(0, 100).map((o) => (
              <tr key={o.id}>
                <td><Link className="rowlink mono" href={`/orders/${o.no}`}>{o.no}</Link></td><td className="text-muted">{fmtDateTime(o.submittedAt)}</td>
                <td>{userById(o.repId)?.name}</td><td>{o.customer.name}</td><td>{pkgById(o.packageId).name}</td><td><Status o={o} /></td>
                <td>{extra(o)}</td><td className="text-muted">{relTime(o.updatedAt)}</td>
              </tr>))}</tbody></table>)}
      </div>
      {rows.length > 100 && <p className="mt-2 text-[12px] text-muted">Showing the first 100. Use Orders for full filtering.</p>}
    </>
  );
}
export { fmtDate };
