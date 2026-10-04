export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-[9px] text-[15px] font-bold text-white" style={{ background: "var(--brand-solid)", boxShadow: "inset 0 1px 0 rgb(255 255 255 / .22)" }}>S</span>
      <div className="leading-[15px]">
        <div className="text-[13px] font-semibold tracking-tight">The Sales House</div>
        <div className="text-[11px] text-muted">SalesOS</div>
      </div>
    </div>
  );
}
