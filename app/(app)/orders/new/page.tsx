"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { DEALERS, DEMO_DUPLICATE, INTERNET_PACKAGES, NOW, PACKAGES, USERS, userById, type Order } from "@/lib/mock";
import { formatPhone, fmtMoney } from "@/lib/format";
import { statusOf } from "@/lib/status";
import { Field, PageHeader, useToast } from "@/components/ui";

const DRAFT_KEY = "salesos.draft.v1";
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

interface Form { name: string; email: string; phone: string; mm: string; dd: string; yyyy: string; line1: string; unit: string; city: string; state: string; zip: string; pkg: string; extras: string[]; dealer: string; agent: string; zoey: string; notes: string }
const blank = (agent: string, dealer: string): Form => ({ name: "", email: "", phone: "", mm: "", dd: "", yyyy: "", line1: "", unit: "", city: "", state: "", zip: "", pkg: "", extras: [], dealer, agent, zoey: "", notes: "" });
const norm = (s: string) => s.toLowerCase().replace(/\b(street|st)\b/g, "st").replace(/\b(avenue|ave)\b/g, "ave").replace(/\b(apartment|apt|unit|#)\b/g, "").replace(/[^a-z0-9]/g, "");

function validate(f: Form) {
  const e: Partial<Record<keyof Form | "dob", string>> = {};
  if (f.name.trim().split(/\s+/).length < 2) e.name = "Enter the customer’s first and last name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) e.email = "Enter a valid email address.";
  if (f.phone.replace(/\D/g, "").length !== 10) e.phone = "Enter a 10-digit phone number.";
  const m = +f.mm, d = +f.dd, y = +f.yyyy;
  const dt = new Date(y, m - 1, d);
  if (!f.mm || !f.dd || f.yyyy.length !== 4) e.dob = "Enter the full date of birth.";
  else if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) e.dob = "That isn’t a valid date.";
  else if (new Date(NOW).getFullYear() - y < 18 || y < 1900) e.dob = "Customer must be 18 or older.";
  if (f.line1.trim().length < 4) e.line1 = "Enter the street address.";
  if (f.city.trim().length < 2) e.city = "Enter the city.";
  if (!f.state) e.state = "Select a state.";
  if (!/^\d{5}$/.test(f.zip)) e.zip = "Enter a 5-digit ZIP.";
  if (!f.pkg) e.pkg = "Select the internet package sold.";
  if (!f.dealer) e.dealer = "Select the dealer login used.";
  return e;
}

export default function SubmitSale() {
  const { role, actor, allOrders, addOrder, nextOrderNo, stamp, logAudit } = useStore();
  const toast = useToast();
  const myDealer = DEALERS[0].login;
  const [f, setF] = useState<Form>(() => blank(actor.id, myDealer));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState<Order | null>(null);
  const [ack, setAck] = useState(false);
  const [why, setWhy] = useState("");
  const [restored, setRestored] = useState(false);
  const idem = useRef<string>(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const dd = useRef<HTMLInputElement>(null), yy = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setF((x) => {
      if (role === "rep") return { ...x, agent: actor.id };
      const opts = USERS.filter((u) => u.role === "rep" && u.status === "active" && (role === "admin" || u.managerId === actor.id));
      return opts.some((u) => u.id === x.agent) ? x : { ...x, agent: opts[0]?.id ?? "" };
    });
  }, [actor.id, role]);
  useEffect(() => {
    try { const d = localStorage.getItem(DRAFT_KEY); if (d) { setF((x) => ({ ...x, ...JSON.parse(d), mm: "", dd: "", yyyy: "", agent: x.agent })); setRestored(true); } } catch {}
  }, []);
  useEffect(() => {
    if (done) return;
    const { mm, dd: _d, yyyy, ...safe } = f; void mm; void _d; void yyyy; // DOB is never persisted in the draft
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(safe)); } catch {}
  }, [f, done]);

  const errors = useMemo(() => validate(f), [f]);
  const show = (k: string) => (submitted || touched.has(k)) && errors[k as keyof typeof errors];
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const blur = (k: string) => () => setTouched((t) => new Set(t).add(k));

  // Duplicate detection (prototype of server-side scoring)
  const matches = useMemo(() => {
    const out: { o: Order; why: string[] }[] = [];
    const ph = f.phone.replace(/\D/g, ""), addr = norm(f.line1 + f.unit + f.zip);
    if (!(ph.length === 10 || f.email.includes("@") || f.line1.length > 5 || f.zoey)) return out;
    for (const o of allOrders) {
      const r: string[] = [];
      if (f.zoey && o.zoeyNo === f.zoey.trim()) r.push("Same Zoey order number");
      if (f.email && o.customer.email === f.email.trim().toLowerCase()) r.push("Same email");
      if (ph.length === 10 && o.customer.phone.replace(/\D/g, "") === ph) r.push("Same phone");
      if (f.line1.length > 5 && f.zip.length === 5 && norm(o.address.line1 + o.address.unit + o.address.zip) === addr) r.push("Same address & unit");
      if (r.length && !o.outcome) out.push({ o, why: r });
    }
    return out.slice(0, 5);
  }, [f.phone, f.email, f.line1, f.unit, f.zip, f.zoey, allOrders]);
  const strong = matches.some((m) => m.why.length > 1 || m.why.includes("Same Zoey order number") || m.why.includes("Same address & unit"));
  const needsOverride = matches.length > 0;

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) { document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(); return; }
    if (needsOverride && !ack) { document.getElementById("dup-ack")?.focus(); return; }
    if (needsOverride && role !== "rep" && !why.trim()) { document.getElementById("dup-why")?.focus(); return; }
    if (done) return;
    const agent = userById(f.agent)!;
    const at = stamp();
    const no = nextOrderNo();
    const o: Order = {
      id: "n" + idem.current, no, submittedAt: at, updatedAt: at, repId: agent.id, teamId: agent.teamId, managerId: agent.managerId, market: agent.market,
      customer: { name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone, dob: `${f.mm.padStart(2, "0")}/${f.dd.padStart(2, "0")}/${f.yyyy}`, dobYear: +f.yyyy },
      address: { line1: f.line1.trim(), unit: f.unit.trim(), city: f.city.trim(), state: f.state, zip: f.zip },
      packageId: f.pkg, extras: f.extras, dealerLogin: f.dealer, zoeyNo: f.zoey.trim() || null, stage: "submitted", outcome: null,
      attention: needsOverride && role === "rep" ? "Possible duplicate — review needed" : null, installDate: null, activatedAt: null, installedAt: null,
      source: "manual", duplicateOf: matches.map((m) => m.o.no),
      history: [{ at, kind: "stage", from: null, to: "submitted", actor: actor.id }], notes: f.notes.trim() ? [{ at, author: actor.id, body: f.notes.trim() }] : [],
    };
    addOrder(o);
    logAudit({ actor: actor.id, action: "order.created", entity: o.id, detail: `${no} submitted${needsOverride ? role === "rep" ? " (flagged as possible duplicate)" : ` (duplicate overridden: ${why.trim()})` : ""}` });
    if (needsOverride && role !== "rep") logAudit({ actor: actor.id, action: "order.duplicate_overridden", entity: o.id, detail: why.trim() });
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setDone(o);
    window.scrollTo({ top: 0 });
  };

  const another = () => {
    idem.current = crypto.randomUUID?.() ?? String(Date.now());
    setF({ ...blank(f.agent, f.dealer), pkg: "" }); setDone(null); setSubmitted(false); setTouched(new Set()); setAck(false); setWhy(""); setRestored(false);
  };

  if (done) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <div className="panel p-6" role="status">
          <div className="eyebrow mb-2" style={{ color: "var(--ok)" }}>Submitted</div>
          <h1 className="m-0 text-xl font-semibold tracking-tight">Order {done.no} submitted successfully</h1>
          <p className="mb-0 mt-1 text-muted">{done.customer.name} · {PACKAGES.find((p) => p.id === done.packageId)?.name}. Status: {statusOf(done).label}. Management can see it now.{done.attention ? " It was flagged for manager review as a possible duplicate." : ""}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/orders/${done.no}`} className="btn btn-primary no-underline">View order</Link>
            <button className="btn" onClick={another}>Submit another</button>
          </div>
          <p className="mb-0 mt-4 text-[12px] text-faint">Prototype: the order is held in memory for this session only.</p>
        </div>
      </div>
    );
  }

  const sample = (dup: boolean) => {
    const d = dup ? DEMO_DUPLICATE : { name: "Jordan Ellison", email: "jordan.ellison@example.com", phone: "(215) 555-0177", line1: "88 Linden Row", unit: "", city: "Philadelphia", state: "PA", zip: "19103" };
    setF((x) => ({ ...x, ...d, mm: "04", dd: "17", yyyy: "1988", pkg: "p3", extras: ["p6"], zoey: dup ? "" : "ZY4812093", notes: "" }));
  };
  const err = (k: keyof Form | "dob") => (show(k) ? errors[k] : undefined);
  const inv = (k: keyof Form | "dob") => (show(k) ? true : undefined);
  const agentOptions = USERS.filter((u) => u.role === "rep" && u.status === "active" && (role === "admin" || u.managerId === actor.id));

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-4xl pb-20">
      <PageHeader title="Submit sale" sub="Enter the order immediately after processing it in Zoey."
        actions={<><button type="button" className="btn btn-sm" onClick={() => sample(false)}>Fill sample</button><button type="button" className="btn btn-sm" onClick={() => sample(true)}>Fill duplicate sample</button></>} />
      {restored && <p className="mb-4 rounded-md border border-line bg-subtle px-3 py-2 text-[12px]" role="status">Draft restored from this device. Date of birth is never saved in drafts. <button type="button" className="text-brand" onClick={() => { try { localStorage.removeItem(DRAFT_KEY); } catch {} setF(blank(actor.id, myDealer)); setRestored(false); }}>Discard draft</button></p>}

      <div className="panel">
        <fieldset className="m-0 border-0 p-5">
          <legend className="eyebrow float-left mb-3 w-full">Customer</legend>
          <div className="clear-both grid gap-4 md:grid-cols-2">
            <Field label="Customer full name" htmlFor="name" error={err("name")}>
              <input id="name" className="input" autoFocus autoComplete="name" value={f.name} aria-invalid={inv("name")} aria-describedby={err("name") ? "name-err" : undefined} onBlur={blur("name")} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email" error={err("email")}>
              <input id="email" type="email" className="input" autoComplete="email" inputMode="email" value={f.email} aria-invalid={inv("email")} onBlur={blur("email")} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Contact phone" htmlFor="phone" error={err("phone")}>
              <input id="phone" type="tel" className="input" autoComplete="tel" inputMode="tel" placeholder="(555) 123-4567" value={f.phone} aria-invalid={inv("phone")} onBlur={blur("phone")} onChange={(e) => set("phone", formatPhone(e.target.value))} />
            </Field>
            <div>
              <span className="label" id="dob-l">Date of birth</span>
              <div role="group" aria-labelledby="dob-l" className="flex items-center gap-2">
                <input aria-label="Month" className="input w-16 text-center" inputMode="numeric" maxLength={2} placeholder="MM" autoComplete="bday-month" value={f.mm} aria-invalid={inv("dob")} onBlur={blur("dob")} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); set("mm", v); if (v.length === 2) dd.current?.focus(); }} />
                <span className="text-faint">/</span>
                <input ref={dd} aria-label="Day" className="input w-16 text-center" inputMode="numeric" maxLength={2} placeholder="DD" autoComplete="bday-day" value={f.dd} aria-invalid={inv("dob")} onBlur={blur("dob")} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); set("dd", v); if (v.length === 2) yy.current?.focus(); }} />
                <span className="text-faint">/</span>
                <input ref={yy} aria-label="Year" className="input w-24 text-center" inputMode="numeric" maxLength={4} placeholder="YYYY" autoComplete="bday-year" value={f.yyyy} aria-invalid={inv("dob")} onBlur={blur("dob")} onChange={(e) => set("yyyy", e.target.value.replace(/\D/g, ""))} />
              </div>
              {err("dob") ? <p className="err">{err("dob")}</p> : <p className="help">Encrypted on save. Shown masked everywhere after submission.</p>}
            </div>
          </div>
        </fieldset>

        <fieldset className="sep m-0 border-x-0 border-b-0 p-5">
          <legend className="eyebrow float-left mb-3 w-full">Service address</legend>
          <div className="clear-both grid gap-4 md:grid-cols-6">
            <Field className="md:col-span-4" label="Street" htmlFor="line1" error={err("line1")}><input id="line1" className="input" autoComplete="address-line1" value={f.line1} aria-invalid={inv("line1")} onBlur={blur("line1")} onChange={(e) => set("line1", e.target.value)} /></Field>
            <Field className="md:col-span-2" label="Unit / Apt" htmlFor="unit"><input id="unit" className="input" autoComplete="address-line2" value={f.unit} onChange={(e) => set("unit", e.target.value)} /></Field>
            <Field className="md:col-span-3" label="City" htmlFor="city" error={err("city")}><input id="city" className="input" autoComplete="address-level2" value={f.city} aria-invalid={inv("city")} onBlur={blur("city")} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field className="md:col-span-1" label="State" htmlFor="state" error={err("state")}><select id="state" className="input" autoComplete="address-level1" value={f.state} aria-invalid={inv("state")} onBlur={blur("state")} onChange={(e) => set("state", e.target.value)}><option value="">—</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field className="md:col-span-2" label="ZIP" htmlFor="zip" error={err("zip")}><input id="zip" className="input" inputMode="numeric" maxLength={5} autoComplete="postal-code" value={f.zip} aria-invalid={inv("zip")} onBlur={blur("zip")} onChange={(e) => set("zip", e.target.value.replace(/\D/g, ""))} /></Field>
          </div>
        </fieldset>

        <fieldset className="sep m-0 border-x-0 border-b-0 p-5">
          <legend className="eyebrow float-left mb-3 w-full">Sale</legend>
          <div className="clear-both grid gap-4 md:grid-cols-2">
            <Field label="Provider" htmlFor="prov"><select id="prov" className="input" disabled><option>Xfinity</option></select></Field>
            <Field label="Internet package" htmlFor="pkg" error={err("pkg")}>
              <select id="pkg" className="input" value={f.pkg} aria-invalid={inv("pkg")} onBlur={blur("pkg")} onChange={(e) => set("pkg", e.target.value)}>
                <option value="">Select package…</option>{INTERNET_PACKAGES.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtMoney(p.price)}/mo</option>)}
              </select>
            </Field>
            <div className="md:col-span-2">
              <span className="label" id="extras-l">Additional products</span>
              <div role="group" aria-labelledby="extras-l" className="flex flex-wrap gap-x-5 gap-y-1">
                {PACKAGES.filter((p) => p.category !== "internet").map((p) => (
                  <label key={p.id} className="flex items-center gap-2 py-1.5"><input type="checkbox" checked={f.extras.includes(p.id)} onChange={(e) => set("extras", e.target.checked ? [...f.extras, p.id] : f.extras.filter((x) => x !== p.id))} />{p.name}</label>))}
              </div>
            </div>
            <Field label="Dealer login used" htmlFor="dealer" error={err("dealer")} help="Username only — never enter a password here.">
              <select id="dealer" className="input" value={f.dealer} aria-invalid={inv("dealer")} onBlur={blur("dealer")} onChange={(e) => set("dealer", e.target.value)}>{DEALERS.map((d) => <option key={d.id} value={d.login}>{d.login} — {d.label}</option>)}</select>
            </Field>
            {role !== "rep" && (
              <Field label="Agent" htmlFor="agent" help="Submitting on behalf of a rep.">
                <select id="agent" className="input" value={f.agent} onChange={(e) => set("agent", e.target.value)}>
                  {agentOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>)}
          </div>
        </fieldset>

        <fieldset className="sep m-0 border-x-0 border-b-0 p-5">
          <legend className="eyebrow float-left mb-3 w-full">Order</legend>
          <div className="clear-both grid gap-4 md:grid-cols-2">
            <Field label="Zoey order number (optional)" htmlFor="zoey"><input id="zoey" className="input mono" value={f.zoey} onChange={(e) => set("zoey", e.target.value.toUpperCase())} /></Field>
            <div className="md:col-span-2"><Field label="Notes" htmlFor="notes"><textarea id="notes" className="input" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>
          </div>
        </fieldset>
      </div>

      {matches.length > 0 && (
        <section className="panel mt-4" aria-labelledby="dup-h" role="alert" style={{ borderColor: "var(--warn)" }}>
          <div className="panel-h" style={{ background: "var(--warn-bg)" }}><h2 id="dup-h">Potential duplicate detected</h2><span className="text-[12px] text-muted">{strong ? "Likely duplicate" : "Weak match"}</span></div>
          <table className="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Matched on</th><th>Status</th></tr></thead>
            <tbody>{matches.map(({ o, why: w }) => (
              <tr key={o.id}><td className="mono">{o.no}</td><td>{role === "rep" && o.repId !== actor.id ? <span className="text-faint">Another rep’s customer</span> : o.customer.name}</td><td>{w.join(", ")}</td><td>{statusOf(o).label}</td></tr>))}</tbody></table>
          <div className="space-y-3 border-t border-line p-4">
            <label className="flex items-start gap-2"><input id="dup-ack" type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>{role === "rep" ? "This is a different order. Submit it flagged for manager review." : "I’ve reviewed the matches and want to override the duplicate warning."}</span></label>
            {role !== "rep" && <Field label="Override reason (recorded in audit log)" htmlFor="dup-why"><input id="dup-why" className="input" value={why} onChange={(e) => setWhy(e.target.value)} /></Field>}
            {submitted && needsOverride && !ack && <p className="err m-0">Confirm to continue with a possible duplicate.</p>}
          </div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 py-3 lg:left-[232px]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <span className="hidden text-[12px] text-muted sm:inline">{Object.keys(errors).length && submitted ? `${Object.keys(errors).length} field(s) need attention` : "Draft saved on this device"} · <span className="kbd">Tab</span> to move</span>
          <button type="submit" className="btn btn-primary btn-lg w-full sm:w-auto">Submit order</button>
        </div>
      </div>
    </form>
  );
}
