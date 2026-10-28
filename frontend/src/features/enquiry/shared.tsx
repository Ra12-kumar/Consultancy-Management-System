import { Badge } from "@/components/ui/Feedback";
import type { AppointmentStatus, EnquiryStatus } from "@/types/enquiry";

// Mirrors backend/src/services/enquiryWorkflow.ts (the server enforces every rule; this only drives the UI).
export const PIPELINE: EnquiryStatus[] = ["NEW", "CONTACTED", "COUNSELLING_SCHEDULED", "DOCUMENTS_PENDING", "APPLICATION_IN_PROGRESS", "SUBMITTED", "OFFER_RECEIVED", "ADMITTED"];
export const SIDE: EnquiryStatus[] = ["ON_HOLD", "REJECTED", "WITHDRAWN", "CLOSED"];
export const FINISHED: EnquiryStatus[] = ["ADMITTED", "REJECTED", "WITHDRAWN", "CLOSED"];

export const STUDENT_LABELS: Record<EnquiryStatus, string> = {
  NEW: "Received",
  CONTACTED: "In touch with you",
  COUNSELLING_SCHEDULED: "Counselling scheduled",
  DOCUMENTS_PENDING: "Documents needed",
  APPLICATION_IN_PROGRESS: "Application in progress",
  SUBMITTED: "Application submitted",
  OFFER_RECEIVED: "Offer received",
  ADMITTED: "Admission confirmed",
  ON_HOLD: "On hold",
  REJECTED: "Not successful",
  WITHDRAWN: "Withdrawn",
  CLOSED: "Closed",
};
export const ADMIN_LABELS: Record<EnquiryStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  COUNSELLING_SCHEDULED: "Counselling scheduled",
  DOCUMENTS_PENDING: "Documents pending",
  APPLICATION_IN_PROGRESS: "Application in progress",
  SUBMITTED: "Submitted",
  OFFER_RECEIVED: "Offer received",
  ADMITTED: "Admitted",
  ON_HOLD: "On hold",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  CLOSED: "Closed",
};

export function reasonRequired(from: EnquiryStatus, to: EnquiryStatus) {
  if (SIDE.includes(to) || FINISHED.includes(from)) return true;
  const i = PIPELINE.indexOf(from);
  const j = PIPELINE.indexOf(to);
  return i >= 0 && j >= 0 && j < i;
}

const TONE: Record<EnquiryStatus, "neutral" | "success" | "warning" | "danger" | "gold"> = {
  NEW: "gold",
  CONTACTED: "neutral",
  COUNSELLING_SCHEDULED: "neutral",
  DOCUMENTS_PENDING: "warning",
  APPLICATION_IN_PROGRESS: "neutral",
  SUBMITTED: "neutral",
  OFFER_RECEIVED: "success",
  ADMITTED: "success",
  ON_HOLD: "warning",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  CLOSED: "neutral",
};
export const StatusBadge = ({ status, admin = false }: { status: EnquiryStatus; admin?: boolean }) => <Badge tone={TONE[status]}>{(admin ? ADMIN_LABELS : STUDENT_LABELS)[status]}</Badge>;

export const APPOINTMENT_LABELS: Record<AppointmentStatus, string> = { scheduled: "Awaiting your confirmation", confirmed: "Confirmed", reschedule_requested: "Reschedule requested", cancelled: "Cancelled", completed: "Completed", no_show: "Missed" };
export const MODE_LABELS = { phone: "Phone call", video: "Video call", office: "At our office" } as const;
export const APPLICATION_LABELS: Record<string, string> = { planned: "Planned", submitted: "Submitted", offer_received: "Offer received", admitted: "Admission confirmed", rejected: "Not successful", withdrawn: "Withdrawn" };

// Progress through the main pipeline (side statuses show where it stopped).
export function StatusStepper({ status, history }: { status: EnquiryStatus; history: EnquiryStatus[] }) {
  const reached = Math.max(...[status, ...history].map((s) => PIPELINE.indexOf(s)));
  return (
    <ol aria-label="Enquiry progress" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {PIPELINE.map((s, i) => {
        const current = s === status;
        const done = i <= reached && !current;
        return (
          <li key={s} aria-current={current ? "step" : undefined} className={`rounded-xl border px-2 py-2 text-center text-xs ${current ? "border-accent bg-accent/15 font-bold" : done ? "border-success/40 bg-success/10" : "border-line text-muted"}`}>
            <span aria-hidden="true">{done ? "✓ " : ""}</span>
            {STUDENT_LABELS[s]}
          </li>
        );
      })}
    </ol>
  );
}

// `datetime-local` values are India time; convert to an ISO string with the +05:30 offset (and back).
export const istInputToIso = (v: string) => (v ? `${v.length === 16 ? `${v}:00` : v}+05:30` : "");
export function isoToIstInput(iso: string) {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  return d.toISOString().slice(0, 16);
}
