"use client";
import { useState } from "react";
import type { Bucket } from "@/lib/metrics";

/** Submitted (bars) vs installed (line). Hairline grid, readout on hover/focus. */
export function TrendChart({ data }: { data: Bucket[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 640, H = 190, L = 26, B = 22, T = 8, R = 4;
  const max = Math.max(4, ...data.map((d) => Math.max(d.submitted, d.installed)));
  const nice = Math.ceil(max / 4) * 4;
  const bw = (W - L - R) / Math.max(1, data.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const x = (i: number) => L + i * bw + bw / 2;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.installed).toFixed(1)}`).join(" ");
  const cur = hi != null ? data[hi] : null;
  const step = Math.ceil(data.length / 8);
  return (
    <div>
      <div className="mb-3 flex min-h-5 flex-wrap items-center gap-x-4 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: "var(--brand-solid)" }} />Submitted</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-3 bg-ink" />Installed</span>
        <span className="ml-auto text-ink" aria-live="polite">{cur ? `${cur.label} — ${cur.submitted} submitted · ${cur.installed} installed` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales submitted and installed over the selected range" className="h-auto w-full">
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (nice / 4) * k;
          return <g key={k}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={k ? "2 4" : undefined} /><text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--faint)">{v}</text></g>;
        })}
        {data.map((d, i) => (
          <g key={i}>
            <rect x={x(i) - Math.min(bw * 0.28, 14)} width={Math.min(bw * 0.56, 28)} y={y(d.submitted)} height={Math.max(0, H - B - y(d.submitted))} rx="3" fill="var(--brand-solid)" opacity={hi == null || hi === i ? 1 : 0.4} />
            <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" tabIndex={0} aria-label={`${d.label}: ${d.submitted} submitted, ${d.installed} installed`}
              onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(i)} onBlur={() => setHi(null)} />
            {i % step === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--faint)">{d.label}</text>}
          </g>
        ))}
        <path d={line} fill="none" stroke="var(--text)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
        {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.installed)} r={hi === i ? 3.5 : 0} fill="var(--text)" pointerEvents="none" />)}
      </svg>
    </div>
  );
}

export function MiniBars({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={label} className="flex h-28 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[11px] text-muted">{d.value}</span>
          <div className="w-full rounded" style={{ height: `${Math.max(3, (d.value / max) * 64)}px`, background: "var(--brand-solid)" }} />
          <span className="text-[10px] text-faint">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
