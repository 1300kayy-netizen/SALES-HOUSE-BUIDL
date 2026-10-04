"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { pkgById, userById, PACKAGES } from "@/lib/mock";
import { fmtDate, fmtDateTime, fmtMoney, formatPhone, relTime } from "@/lib/format";
import { STAGE_LABEL, OUTCOME_LABEL, allowedTransitions, type Transition } from "@/lib/status";
import { can, canSee } from "@/lib/permissions";
import { CopyButton, Dialog, EmptyState, Menu, MenuItem, Status, useToast } from "@/components/ui";

const who = (id: string) => (id === "System" ? "System" : userById(id)?.name ?? id);

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="eyebrow m-0 mb-1">{title}</h2>
      {children}
    </section>
  );
}

export default function OrderDetail({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = use(params);
  const { allOrders, role, actor, changeStatus, addNote, logAudit, audit, updateCustomer } = useStore();
  const toast = useToast();
  const order = allOrders.find((o) => o.no === orderNo);

  const [revealOpen, setRevealOpen] = useState(false);
  const [why, setWhy] = useState("");
  const [dob, setDob] = useState<string | null>(null);
  const [pending, setPending] = useState<Transition | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState({ phone: "", email: "" });

  useEffect(() => { if (dob == null) return; const t = setTimeout(() => setDob(null), 30_000); return () => clearTimeout(t); }, [dob]);
  useEffect(() => setDob(null), [role, orderNo]);

  const transitions = useMemo(() => (order ? allowedTransitions(order, role) : []), [order, role]);
  if (!order || !canSee(actor, order)) {
    return <div className="panel"><EmptyState title="Order not found" body="It may not exist, or you don’t have access to it." action={<Link href="/orders" className="btn btn-sm no-underline">Back to orders</Link>} /></div>;
  }
  const o = order;
  const next = transitions.find((t) => t.kind === "stage" && !t.requiresReason);
  const others = transitions.filter((t) => t !== next);
  const items = [pkgById(o.packageId), ...o.extras.map((e) => PACKAGES.find((p) => p.id === e)!)];
  const addr = `${o.address.line1}${o.address.unit ? ", " + o.address.unit : ""}, ${o.address.city}, ${o.address.state} ${o.address.zip}`;

  const apply = (t: Transition, why?: string) => {
    changeStatus([o.id], t.to === "reopen" ? "reopen" : t.kind, t.to, why ?? "");
    toast(`${o.no}: ${t.to === "reopen" ? "reopened" : t.label.replace(/^(Move to|Back to|Mark) /, "")}`);
  };

  const events = [
    ...o.history.map((h) => ({ at: h.at, title: h.kind === "attention" ? "Flagged for attention" : h.kind === "stage" ? (h.from === null ? "Submitted" : STAGE_LABEL[h.to as keyof typeof STAGE_LABEL]) : h.to ? OUTCOME_LABEL[h.to as keyof typeof OUTCOME_LABEL] : "Reopened", by: who(h.actor), sub: h.reason, dot: h.kind === "outcome" && h.to ? "var(--bad)" : h.kind === "attention" ? "var(--warn)" : "var(--brand-solid)" })),
    ...o.notes.map((n) => ({ at: n.at, title: "Note", by: who(n.author), sub: n.body, dot: "var(--faint)" })),
    ...audit.filter((a) => (a.entity === o.id || a.entity === o.no) && a.action !== "order.status_changed" && a.action !== "order.note_added").map((a) => ({ at: a.at, title: a.action === "order.dob_revealed" ? "DOB revealed" : a.action === "order.edited" ? "Contact edited" : a.action.replace(/^order\./, "").replace(/_/g, " "), by: who(a.actor), sub: a.detail, dot: "var(--faint)" })),
  ].sort((a, b) => b.at - a.at);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/orders" className="text-[13px] text-muted no-underline hover:text-ink">← Orders</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[26px] font-semibold leading-8 tracking-[-0.03em]">{o.customer.name}</h1>
            <Status o={o} />
          </div>
          <div className="mt-1 text-muted"><span className="mono">{o.no}</span> · {who(o.repId)} · {fmtDateTime(o.submittedAt)}</div>
          {o.duplicateOf.length > 0 && <div className="mt-2"><span className="flag">Possible duplicate of {o.duplicateOf[0]}</span></div>}
        </div>
        <div className="flex items-center gap-2">
          {next && <button className="btn btn-primary" onClick={() => apply(next)}>{next.label} →</button>}
          <Menu label="More">
            <MenuItem onClick={() => { setDraft({ phone: o.customer.phone, email: o.customer.email }); setEditOpen(true); }}>Edit contact details</MenuItem>
            {can.changeStatus(role) && others.map((t) => <MenuItem key={t.to} danger={t.kind === "outcome" && t.to !== "reopen"} onClick={() => { setReason(""); setPending(t); }}>{t.label}</MenuItem>)}
            {role === "admin" && <MenuItem danger onClick={() => toast("Archiving arrives in Phase 4", "err")}>Archive order</MenuItem>}
          </Menu>
        </div>
      </div>

      {o.attention && !o.outcome && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3" style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}>
          <span><b className="text-warn">Needs attention.</b> {o.attention}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Block title="Customer">
            <dl className="dl m-0">
              <dt>Email</dt><dd>{o.customer.email} <CopyButton value={o.customer.email} label="Email" /></dd>
              <dt>Phone</dt><dd>{o.customer.phone} <CopyButton value={o.customer.phone} label="Phone" /></dd>
              <dt>Address</dt><dd>{addr} <CopyButton value={addr} label="Address" /></dd>
              <dt>Date of birth</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="mono" aria-live="polite">{dob ?? `••/••/${o.customer.dobYear}`}</span>
                {can.revealDob(role) ? (dob ? <button className="text-[13px] text-brand" onClick={() => setDob(null)}>Hide</button> : <button className="text-[13px] text-brand" onClick={() => { setWhy(""); setRevealOpen(true); }}>Reveal</button>)
                  : <span className="text-[12px] text-faint">Hidden for your role</span>}
                {dob && <span className="text-[12px] text-muted">Re-hides in 30s · logged</span>}
              </dd>
            </dl>
          </Block>

          <Block title="Sale">
            <table className="tbl mt-1"><tbody>{items.map((p) => <tr key={p.id}><td style={{ paddingLeft: 0 }}>{p.name}<div className="text-[12px] capitalize text-faint">{p.category}</div></td><td className="r" style={{ paddingRight: 0 }}>{fmtMoney(p.price)}/mo</td></tr>)}</tbody></table>
            <dl className="dl m-0 mt-2">
              <dt>Dealer login</dt><dd className="mono">{o.dealerLogin}</dd>
              <dt>Zoey order</dt><dd>{o.zoeyNo ? <span className="mono">{o.zoeyNo}</span> : <span className="text-faint">Not provided</span>}</dd>
              <dt>Install date</dt><dd>{o.installDate ? fmtDate(o.installDate) : <span className="text-faint">Not scheduled</span>}</dd>
              <dt>Team</dt><dd>{o.market} · {who(o.managerId)}</dd>
            </dl>
            <p className="mb-0 mt-3 text-[12px] text-faint">Package and price are saved as sold; later catalog changes never alter this order.</p>
          </Block>

          <Block title="Notes">
            <form onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; addNote(o.id, note.trim()); setNote(""); toast("Note added"); }} className="mt-2 flex gap-2">
              <label htmlFor="note" className="sr-only">Add a note</label>
              <input id="note" className="input" placeholder="Add a note for your team…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn" type="submit" disabled={!note.trim()}>Add</button>
            </form>
            {o.notes.length > 0 && <ul className="m-0 mt-3 list-none p-0">{o.notes.slice().reverse().map((n, i) => <li key={i} className="border-t border-line py-2"><div className="text-[12px] text-muted">{who(n.author)} · {relTime(n.at)}</div>{n.body}</li>)}</ul>}
          </Block>
        </div>

        <aside aria-label="History">
          <section className="panel p-5 lg:sticky lg:top-20">
            <h2 className="eyebrow m-0 mb-4">History</h2>
            <ol className="m-0 max-h-[60vh] list-none overflow-y-auto p-0">
              {events.map((e, i) => (
                <li key={i} className="relative pb-4 pl-5 last:pb-0">
                  {i < events.length - 1 && <span className="absolute bottom-0 left-[3px] top-3 w-px bg-line" />}
                  <span className="absolute left-0 top-[7px] h-[7px] w-[7px] rounded-full" style={{ background: i === 0 ? "var(--brand-solid)" : e.dot, opacity: i === 0 ? 1 : 0.8 }} />
                  <div className="font-medium leading-5">{e.title}</div>
                  <div className="text-[12px] text-muted">{e.by} · {fmtDateTime(e.at)}</div>
                  {e.sub && <div className="mt-0.5 text-[13px] text-muted">{e.sub}</div>}
                </li>))}
            </ol>
          </section>
        </aside>
      </div>

      <Dialog open={revealOpen} onClose={() => setRevealOpen(false)} title="Reveal date of birth"
        footer={<><button className="btn" onClick={() => setRevealOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={why.trim().length < 3} onClick={() => { setRevealOpen(false); setDob(o.customer.dob); logAudit({ actor: actor.id, action: "order.dob_revealed", entity: o.id, detail: `Reason: ${why.trim()}` }); toast("DOB revealed · access logged"); }}>Reveal</button></>}>
        <p className="mt-0 text-muted">This is logged with your name, the time and your reason.</p>
        <label className="label" htmlFor="rv">Reason</label>
        <input id="rv" className="input" autoFocus value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Verifying identity with Xfinity" />
      </Dialog>

      <Dialog open={!!pending} onClose={() => setPending(null)} title={pending?.label ?? ""}
        footer={<><button className="btn" onClick={() => setPending(null)}>Back</button>
          <button className="btn btn-primary" disabled={!!pending?.requiresReason && !reason.trim()} onClick={() => { if (pending) apply(pending, reason.trim()); setPending(null); }}>Confirm</button></>}>
        <label className="label" htmlFor="sr">Reason</label>
        <input id="sr" className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required — saved in the history" />
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit contact details"
        footer={<><button className="btn" onClick={() => setEditOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => {
            const patch: { phone?: string; email?: string } = {};
            if (draft.phone !== o.customer.phone) patch.phone = draft.phone;
            if (draft.email !== o.customer.email) patch.email = draft.email;
            if (Object.keys(patch).length) { updateCustomer(o.id, patch, ""); toast("Saved · change logged"); }
            setEditOpen(false);
          }}>Save</button></>}>
        <div className="grid gap-3">
          <div><label className="label" htmlFor="e-phone">Phone</label><input id="e-phone" className="input" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: formatPhone(e.target.value) })} /></div>
          <div><label className="label" htmlFor="e-email">Email</label><input id="e-email" type="email" className="input" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
        </div>
        <p className="mb-0 mt-3 text-[12px] text-faint">Name, address and package are locked after submission. Ask an admin to change them.</p>
      </Dialog>
    </>
  );
}
