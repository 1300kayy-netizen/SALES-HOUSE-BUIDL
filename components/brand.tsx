export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-brand text-[13px] font-bold text-[var(--brand-fg)]">S</span>
      <div className="leading-4">
        <div className="text-[13px] font-semibold tracking-tight">THE SALES HOUSE</div>
        <div className="text-[11px] text-muted">SalesOS</div>
      </div>
    </div>
  );
}
