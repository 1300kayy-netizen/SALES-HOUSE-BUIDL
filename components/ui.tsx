"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { statusOf } from "@/lib/status";
import type { Order } from "@/lib/mock";

export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/* ---------- Toasts ---------- */
const ToastCtx = createContext<(msg: string, tone?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: "ok" | "err" }[]>([]);
  const push = useCallback((msg: string, tone: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {items.map((i) => (
          <div key={i.id} className="fade rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-[13px]" style={{ boxShadow: "var(--shadow-pop)", borderLeft: `3px solid ${i.tone === "ok" ? "var(--ok)" : "var(--bad)"}` }}>
            {i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Dialog (native <dialog>) ---------- */
export function Dialog({ open, onClose, title, children, footer, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const tid = useId();
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={tid} className={className} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div>
          <div className="px-5 pb-1 pt-4"><h2 id={tid} className="m-0 text-[16px] font-semibold tracking-tight">{title}</h2></div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 px-5 pb-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- Small pieces ---------- */
export function Status({ o }: { o: Pick<Order, "stage" | "outcome" | "attention"> }) {
  const s = statusOf(o);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="st" data-tone={s.tone}><i />{s.label}</span>
      {o.attention && !o.outcome && <span className="flag" title={o.attention}>Attention</span>}
    </span>
  );
}

export function PageHeader({ title, sub, actions, children }: { title: string; sub?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[26px] font-semibold leading-8 tracking-[-0.03em]">{title}</h1>
          {sub && <p className="m-0 mt-1 text-muted">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("h-7 rounded-md px-3.5 text-[13px] font-medium transition-colors", value === o.value ? "bg-[var(--hover)] text-ink shadow-[inset_0_0_0_1px_var(--border-strong)]" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="m-0 font-medium">{title}</p>
      {body && <p className="mx-auto mb-0 mt-1 max-w-md text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  return (
    <button type="button" className="rounded px-1 text-[12px] text-faint transition-colors hover:text-brand" aria-label={`Copy ${label}`}
      onClick={() => { navigator.clipboard?.writeText(value).then(() => toast(`${label} copied`), () => toast("Copy not available", "err")); }}>
      Copy
    </button>
  );
}

export function Field({ label, htmlFor, error, help, children, className }: { label: string; htmlFor: string; error?: string; help?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="err" id={`${htmlFor}-err`}>{error}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skel", className)} aria-hidden="true" />;
}

export function Menu({ label, children, align = "right" }: { label: ReactNode; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{label}</button>
      {open && (
        <div className={cn("fade absolute z-30 mt-1 min-w-[200px] rounded-xl border border-line-strong bg-surface p-1", align === "right" ? "right-0" : "left-0")} style={{ boxShadow: "var(--shadow-pop)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
export function MenuItem({ children, onClick, danger }: { children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-subtle", danger && "text-bad")}>{children}</button>;
}
