"use client";
import { DEALERS } from "@/lib/mock";
import { PageHeader, useToast } from "@/components/ui";

export default function DealerAccounts() {
  const toast = useToast();
  return (
    <>
      <PageHeader title="Dealer accounts" sub="Dealer login identifiers only. Passwords are never stored in SalesOS." actions={<button className="btn btn-primary" onClick={() => toast("Dealer account editing arrives in Phase 3", "err")}>Add dealer login</button>} />
      <div className="panel overflow-x-auto"><table className="tbl"><thead><tr><th>Login (username)</th><th>Label</th><th>Provider</th><th>Owner</th><th>Status</th></tr></thead>
        <tbody>{DEALERS.map((d) => <tr key={d.id}><td className="mono">{d.login}</td><td>{d.label}</td><td>Xfinity</td><td>{d.owner}</td><td><span className="st" data-tone="success"><i />Active</span></td></tr>)}</tbody></table></div>
      <p className="mt-3 max-w-2xl text-[12px] text-faint">If dealer credentials ever need managing, use a dedicated secrets manager (e.g. 1Password Secrets Automation or AWS Secrets Manager) — never the application database.</p>
    </>
  );
}
