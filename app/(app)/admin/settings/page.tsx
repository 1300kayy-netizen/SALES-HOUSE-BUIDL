import { PageHeader } from "@/components/ui";

const rows: [string, string, string][] = [
  ["Organization", "The Sales House", "Single organization; every table carries organization_id."],
  ["Time zone", "America/New_York", "Defines what “Today” and “Week” mean. Week starts Monday."],
  ["Rep edit cutoff", "30 minutes", "After this, reps can’t edit protected fields (name, DOB, address, package, dealer login)."],
  ["DOB reveal", "Admin, Manager · reason required", "Every reveal is written to the audit log."],
  ["Session", "12 h absolute · 30 min idle", "MFA required for Admin and Manager."],
  ["Provider", "Xfinity", "Order source: manual entry. Zoey integration is a future adapter; no API is assumed."],
];
export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" sub="Read-only in the prototype. These are the planned defaults." />
      <div className="panel"><dl className="m-0 px-4">{rows.map(([k, v, h]) => (
        <div key={k} className="grid gap-1 border-b border-line py-3 last:border-0 md:grid-cols-[200px_240px_1fr]"><dt className="font-medium">{k}</dt><dd className="m-0">{v}</dd><dd className="m-0 text-muted">{h}</dd></div>))}</dl></div>
    </>
  );
}
