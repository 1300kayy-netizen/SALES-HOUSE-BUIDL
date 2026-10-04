import { EmptyState, PageHeader } from "@/components/ui";

export default function Commissions() {
  return (
    <>
      <PageHeader title="Commissions" sub="Projected vs. paid, by payout period." />
      <div className="panel">
        <EmptyState title="Commission module is not enabled." body="Planned for V1.2: effective-dated commission rules, an append-only ledger (projected, earned, clawback) and payout periods. Orders never store a commission amount, so historical orders won’t change when rates change." />
      </div>
    </>
  );
}
