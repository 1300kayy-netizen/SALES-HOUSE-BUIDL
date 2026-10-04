import type { Order, Outcome, Role, Stage } from "./mock";
import { STAGES } from "./mock";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger";

export const STAGE_LABEL: Record<Stage, string> = {
  submitted: "Submitted", processing: "Processing", pending: "Pending",
  scheduled: "Scheduled", installed: "Installed", activated: "Activated",
};
export const OUTCOME_LABEL: Record<Outcome, string> = {
  cancelled: "Cancelled", failed: "Failed", duplicate: "Duplicate", chargeback: "Chargeback",
};
const STAGE_TONE: Record<Stage, Tone> = {
  submitted: "neutral", processing: "info", pending: "warning", scheduled: "info", installed: "success", activated: "success",
};
const OUTCOME_TONE: Record<Outcome, Tone> = { cancelled: "danger", failed: "danger", duplicate: "neutral", chargeback: "danger" };

export function statusOf(o: Pick<Order, "stage" | "outcome">): { label: string; tone: Tone } {
  return o.outcome
    ? { label: OUTCOME_LABEL[o.outcome], tone: OUTCOME_TONE[o.outcome] }
    : { label: STAGE_LABEL[o.stage], tone: STAGE_TONE[o.stage] };
}

export const isLive = (o: Pick<Order, "outcome">) => !o.outcome;
export const isAwaitingInstall = (o: Pick<Order, "stage" | "outcome">) =>
  !o.outcome && (o.stage === "pending" || o.stage === "scheduled");
export const reachedInstalled = (o: Order) => o.history.some((h) => h.kind === "stage" && (h.to === "installed" || h.to === "activated"));
export const reachedActivated = (o: Order) => o.history.some((h) => h.kind === "stage" && h.to === "activated");

export interface Transition { kind: "stage" | "outcome"; to: string; label: string; requiresReason: boolean }

/** Single source of truth for allowed status moves (server-side in production). */
export function allowedTransitions(o: Order, role: Role): Transition[] {
  if (role === "rep") return [];
  const out: Transition[] = [];
  if (o.outcome) {
    if (role === "admin") out.push({ kind: "outcome", to: "reopen", label: "Reopen order", requiresReason: true });
    return out;
  }
  const i = STAGES.indexOf(o.stage);
  if (i < STAGES.length - 1) out.push({ kind: "stage", to: STAGES[i + 1], label: `Move to ${STAGE_LABEL[STAGES[i + 1]]}`, requiresReason: false });
  if (i > 0) out.push({ kind: "stage", to: STAGES[i - 1], label: `Back to ${STAGE_LABEL[STAGES[i - 1]]}`, requiresReason: true });
  (["cancelled", "failed", "duplicate"] as Outcome[]).forEach((x) => out.push({ kind: "outcome", to: x, label: `Mark ${OUTCOME_LABEL[x]}`, requiresReason: true }));
  if (o.stage === "installed" || o.stage === "activated") out.push({ kind: "outcome", to: "chargeback", label: "Mark Chargeback", requiresReason: true });
  return out;
}
