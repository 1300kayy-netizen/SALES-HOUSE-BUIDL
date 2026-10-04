"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { pkgById, userById, PACKAGES, type Order } from "@/lib/mock";
import { fmtDate, fmtDateTime, fmtMoney, formatPhone, relTime } from "@/lib/format";
import { STAGE_LABEL, OUTCOME_LABEL, allowedTransitions, statusOf } from "@/lib/status";
import { can, canSee } from "@/lib/permissions";
import { CopyButton, Dialog, EmptyState, Menu, MenuItem, Status, useToast } from "@/components/ui";

const who = (id: string) => userById(id)?.name ?? id;
const DOB_VISIBLE_MS = 30_000;
const CUTOFF = 30 * 60_000;

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-line py-5 first:pt-0 last:border-0">
      <div className="mb-2 flex items-center justify-between"><h2 className="eyebrow m-0">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export default function OrderDetail({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = use(params);
  const { allOrders, role, actor, changeStatus, addNote, logAudit, audit, updateCustomer, now } = useStore();
  const toast = useToast();
  const order = allOrders.find((o) => o.no === orderNo);

  const [revealOpen, setRevealOpen] = useState(false);
  const [reveal, setReveal] = useState("");
  const [shownDob, setShownDob] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState({ phone: "", email: "", name: "", line1: "", reason: "" });

  useEffect(() => { if (shownDob == null) return; const t = setTimeout(() => setShownDob(null), DOB_VISIBLE_MS); return () => clearTimeout(t); }, [shownDob]);
  useEffect(() => { setShownDob(null); }, [role, orderNo]);

  const transitions = useMemo(() => (order ? allowedTransitions(order, role) : []), [order, role]);
  if (!order || !canSee(actor, order)) {
    return <div className="panel"><EmptyState title="Order not found" body="It may not exist, or you don’t have access to it." action={<Link href="/orders" className="btn btn-sm no-underline">Back to orders</Link>} /></div>;
  }
  const o: Order = order;
  const rep = userById(o.repId), mgr = userById(o.managerId);
  const items = [{ pkg: pkgById(o.packageId), qty: 1 }, ...o.extras.map((e) => ({ pkg: PACKAGES.find((p) => p.id === e)!, qty: 1 }))];
  const withinCutoff = now - o.submittedAt < CUTOFF;
  const canEdit = role !== "rep" || withinCutoff;
  const chosen = transitions.find((t) => t.to === pick);

  const log = [
    ...o.history.map((h) => ({ at: h.at, text: h.kind === "attention" ? `Flagged: ${h.reason}` : h.from === null && h.kind === "stage" ? "Order submitted" : h.kind === "stage" ? `Status ${STAGE_LABEL[h.from as keyof typeof STAGE_LABEL] ?? h.from} → ${STAGE_LABEL[h.to as keyof typeof STAGE_LABEL] ?? h.to}` : h.to ? `Marked ${OUTCOME_LABEL[h.to as keyof typeof OUTCOME_LABEL]}` : "Reopened", by: h.actor === "System" ? "System" : who(h.actor), reason: h.reason })),
    ...audit.filter((a) => a.entity === o.id || a.entity === o.no).map((a) => ({ at: a.at, text: `${a.action.replace(".", " · ").replace(/_/g, " ")} — ${a.detail}`, by: who(a.actor), reason: undefined as string | undefined })),
  ].sort((a, b) => b.at - a.at);

  return (
    <>
      <div className="sticky top-12 z-10 -mx-4 -mt-6 mb-5 border-b border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 font-mono text-[18px] font-semibold tracking-tight">{o.no}</h1><Status o={o} />
              {o.duplicateOf.length > 0 && <span className="flag">Possible duplicate of {o.duplicateOf[0]}</span>}
            </div>
            <div className="mt-0.5 text-[15px] font-medium">{o.customer.name}</div>
            <div className="text-[12px] text-muted">Submitted by {rep?.name} · {fmtDateTime(o.submittedAt)}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => { setDraft({ phone: o.customer.phone, email: o.customer.email, name: o.customer.name, line1: o.address.line1, reason: "" }); setEditOpen(true); }}>Edit</button>
            <button className="btn btn-primary" disabled={!can.changeStatus(role) || transitions.length === 0} onClick={() => { setPick(transitions[0]?.to ?? ""); setReason(""); setStatusOpen(true); }}
              title={can.changeStatus(role) ? undefined : "Sales reps can’t change status"}>Update status</button>
            <Menu label="More">
              <MenuItem onClick={() => { navigator.clipboard?.writeText(location.href); toast("Link copied"); }}>Copy link</MenuItem>
              <MenuItem onClick={() => toast("Archiving is wired up in Phase 4", "err")} danger>Archive order…</MenuItem>
            </Menu>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div>
          <Section title="Customer information">
            <dl className="dl m-0">
              <dt>Name</dt><dd>{o.customer.name}</dd>
              <dt>Email</dt><dd>{o.customer.email} <CopyButton value={o.customer.email} label="Email" /></dd>
              <dt>Phone</dt><dd>{o.customer.phone} <CopyButton value={o.customer.phone} label="Phone" /></dd>
              <dt>Date of birth</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="mono" aria-live="polite">{shownDob ?? `••/••/${o.customer.dobYear}`}</span>
                {can.revealDob(role) ? (shownDob
                  ? <button className="text-[12px] text-brand" onClick={() => setShownDob(null)}>Hide</button>
                  : <button className="text-[12px] text-brand" onClick={() => { setReveal(""); setRevealOpen(true); }}>Reveal</button>)
                  : <span className="text-[12px] text-faint">Restricted for your role</span>}
                {shownDob && <span className="text-[12px] text-muted">Re-masks in 30 s · access logged</span>}
              </dd>
            </dl>
          </Section>

          <Section title="Service address">
            <p className="m-0">{o.address.line1}{o.address.unit ? `, ${o.address.unit}` : ""}<br />{o.address.city}, {o.address.state} {o.address.zip}{" "}
              <CopyButton value={`${o.address.line1}${o.address.unit ? ", " + o.address.unit : ""}, ${o.address.city}, ${o.address.state} ${o.address.zip}`} label="Address" /></p>
          </Section>

          <Section title="Products sold">
            <table className="tbl"><thead><tr><th>Product</th><th>Category</th><th className="r">Price at sale</th><th className="r">Qty</th></tr></thead>
              <tbody>{items.map(({ pkg, qty }) => <tr key={pkg.id}><td>{pkg.name}</td><td className="capitalize text-muted">{pkg.category}</td><td className="r">{fmtMoney(pkg.price)}/mo</td><td className="r">{qty}</td></tr>)}</tbody></table>
            <p className="mb-0 mt-2 text-[12px] text-muted">Package name and price are snapshotted at submission; later catalog changes don’t alter this order.</p>
          </Section>

          <Section title="Dealer / submission">
            <dl className="dl m-0">
              <dt>Dealer login</dt><dd className="mono">{o.dealerLogin}</dd>
              <dt>Source</dt><dd className="capitalize">{o.source}</dd>
              <dt>Zoey order no.</dt><dd>{o.zoeyNo ? <span className="mono">{o.zoeyNo}</span> : <span className="text-faint">Not provided</span>}</dd>
              <dt>Submitted</dt><dd>{fmtDateTime(o.submittedAt)}</dd>
            </dl>
          </Section>

          <Section title="Installation / activation">
            <dl className="dl m-0">
              <dt>Install date</dt><dd>{o.installDate ? fmtDate(o.installDate) : <span className="text-faint">Not scheduled</span>}</dd>
              <dt>Installed</dt><dd>{o.installedAt ? fmtDateTime(o.installedAt) : <span className="text-faint">—</span>}</dd>
              <dt>Activated</dt><dd>{o.activatedAt ? fmtDateTime(o.activatedAt) : <span className="text-faint">—</span>}</dd>
              <dt>Account number</dt><dd className="text-faint">—</dd>
            </dl>
          </Section>

          <Section title="Internal notes">
            {o.notes.length === 0 && <p className="m-0 mb-3 text-muted">No notes yet.</p>}
            {o.notes.map((n, i) => <div key={i} className="mb-3"><div className="text-[12px] text-muted">{who(n.author)} · {fmtDateTime(n.at)}</div><div>{n.body}</div></div>)}
            <form onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; addNote(o.id, note.trim()); setNote(""); toast("Note added"); }} className="flex gap-2">
              <label htmlFor="note" className="sr-only">Add internal note</label>
              <input id="note" className="input" placeholder="Add an internal note…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn" type="submit" disabled={!note.trim()}>Add</button>
            </form>
          </Section>

          <Section title="Documents"><p className="m-0 text-muted">Document and screenshot uploads arrive in V1.1.</p></Section>
          <Section title="Commission"><p className="m-0 text-muted">Commission module not enabled. Amounts will be derived from effective-dated rules, never stored on the order.</p></Section>
        </div>

        <aside className="space-y-6" aria-label="Order metadata and history">
          <div className="panel">
            <div className="panel-h"><h2>Details</h2></div>
            <dl className="dl m-0 px-4 py-1" style={{ gridTemplateColumns: "100px 1fr" }}>
              <dt>Agent</dt><dd><Link href={role === "rep" ? "#" : `/team/representatives/${o.repId}`} className="rowlink">{rep?.name}</Link></dd>
              <dt>Manager</dt><dd>{mgr?.name}</dd><dt>Market</dt><dd>{o.market}</dd>
              <dt>Created</dt><dd>{fmtDateTime(o.submittedAt)}</dd><dt>Updated</dt><dd>{relTime(o.updatedAt)}</dd>
            </dl>
            {o.attention && !o.outcome && <div className="border-t border-line px-4 py-2 text-[12px]"><span className="flag">Needs attention</span> <span className="text-muted">{o.attention}</span></div>}
          </div>

          <div className="panel">
            <div className="panel-h"><h2>Status timeline</h2><span className="text-[12px] text-muted">Immutable</span></div>
            <ol className="m-0 list-none p-4">
              {[...o.history].filter((h) => h.kind !== "attention").reverse().map((h, i, arr) => {
                const label = h.kind === "stage" ? STAGE_LABEL[h.to as keyof typeof STAGE_LABEL] : h.to ? OUTCOME_LABEL[h.to as keyof typeof OUTCOME_LABEL] : "Reopened";
                return (
                  <li key={i} className="relative pb-4 pl-5 last:pb-0">
                    {i < arr.length - 1 && <span className="absolute bottom-0 left-[3px] top-3 w-px bg-line" />}
                    <span className="absolute left-0 top-1.5 h-[7px] w-[7px] rounded-full" style={{ background: i === 0 ? "var(--brand)" : "var(--border-strong)" }} />
                    <div className="font-medium">{label}</div>
                    <div className="text-[12px] text-muted">{fmtDateTime(h.at)} · {h.actor === "System" ? "System" : who(h.actor)}</div>
                    {h.reason && <div className="text-[12px]">“{h.reason}”</div>}
                  </li>);
              })}
            </ol>
          </div>

          <div className="panel">
            <div className="panel-h"><h2>Activity log</h2></div>
            <ul className="m-0 max-h-[320px] list-none overflow-auto p-0">
              {log.map((l, i) => (
                <li key={i} className="border-b border-line px-4 py-2 text-[12px] last:border-0">
                  <div>{l.text}{l.reason ? ` — “${l.reason}”` : ""}</div><div className="text-muted">{l.by} · {fmtDateTime(l.at)}</div>
                </li>))}
            </ul>
          </div>
        </aside>
      </div>

      <Dialog open={revealOpen} onClose={() => setRevealOpen(false)} title="Reveal date of birth"
        footer={<><button className="btn" onClick={() => setRevealOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={reveal.trim().length < 3} onClick={() => {
            setRevealOpen(false); setShownDob(o.customer.dob);
            logAudit({ actor: actor.id, action: "order.dob_revealed", entity: o.id, detail: `Reason: ${reveal.trim()}` }); toast("DOB revealed · access logged");
          }}>Reveal and log</button></>}>
        <p className="mt-0 text-muted">This action is recorded in the audit log with your name, the time and your reason.</p>
        <label className="label" htmlFor="rv">Reason (required)</label>
        <input id="rv" className="input" value={reveal} onChange={(e) => setReveal(e.target.value)} placeholder="e.g. Verifying identity with Xfinity" />
      </Dialog>

      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} title={`Update status · ${o.no}`}
        footer={<><button className="btn" onClick={() => setStatusOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={!chosen || (chosen.requiresReason && !reason.trim())} onClick={() => {
            if (!chosen) return;
            changeStatus([o.id], chosen.to === "reopen" ? "reopen" : chosen.kind, chosen.to, reason.trim()); setStatusOpen(false); toast(`${o.no} → ${chosen.to === "reopen" ? "Reopened" : chosen.label.replace(/^(Move to|Back to|Mark) /, "")}`);
          }}>Apply</button></>}>
        <p className="mt-0 text-muted">Current status: <b className="text-ink">{statusOf(o).label}</b>. Only transitions allowed by the status rules are shown.</p>
        <label className="label" htmlFor="st">New status</label>
        <select id="st" className="input" value={pick} onChange={(e) => setPick(e.target.value)}>{transitions.map((t) => <option key={t.to} value={t.to}>{t.label}</option>)}</select>
        <label className="label mt-3" htmlFor="sr">Reason{chosen?.requiresReason ? " (required)" : " (optional)"}</label>
        <input id="sr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${o.no}`}
        footer={<><button className="btn" onClick={() => setEditOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={!canEdit} onClick={() => {
            const patch: Parameters<typeof updateCustomer>[1] = {};
            if (draft.phone !== o.customer.phone) patch.phone = draft.phone;
            if (draft.email !== o.customer.email) patch.email = draft.email;
            if (role !== "rep" && draft.name !== o.customer.name) patch.name = draft.name;
            if (role !== "rep" && draft.line1 !== o.address.line1) patch.line1 = draft.line1;
            if (Object.keys(patch).length === 0) { setEditOpen(false); return; }
            if ((patch.name || patch.line1) && !draft.reason.trim()) { toast("A reason is required to change protected fields", "err"); return; }
            updateCustomer(o.id, patch, draft.reason.trim()); setEditOpen(false); toast("Order updated · change logged");
          }}>Save changes</button></>}>
        {!canEdit && <p className="mt-0 rounded border border-line bg-subtle p-2 text-[12px]">The edit window for sales reps (30 minutes after submission) has closed. Ask your manager to make changes.</p>}
        <div className="grid gap-3">
          <div><label className="label" htmlFor="e-phone">Phone</label><input id="e-phone" className="input" disabled={!canEdit} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: formatPhone(e.target.value) })} /></div>
          <div><label className="label" htmlFor="e-email">Email</label><input id="e-email" type="email" className="input" disabled={!canEdit} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
          <div><label className="label" htmlFor="e-name">Customer name <span className="font-normal text-faint">· protected</span></label><input id="e-name" className="input" disabled={role === "rep"} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="e-addr">Service address <span className="font-normal text-faint">· protected</span></label><input id="e-addr" className="input" disabled={role === "rep"} value={draft.line1} onChange={(e) => setDraft({ ...draft, line1: e.target.value })} /></div>
          {role !== "rep" && <div><label className="label" htmlFor="e-why">Reason for protected-field change</label><input id="e-why" className="input" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></div>}
        </div>
      </Dialog>
    </>
  );
}
