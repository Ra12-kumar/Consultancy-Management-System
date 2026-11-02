import { FINISHED_STATUSES, PIPELINE, SIDE_STATUSES, type EnquiryStatus } from '../models/Enquiry.js';

// The enquiry status rules (pure, so they are easy to test and share with the UI).

const pipelineIndex = (s: EnquiryStatus) => (PIPELINE as readonly string[]).indexOf(s);
export const isOpen = (s: EnquiryStatus) => !FINISHED_STATUSES.includes(s);

// Statuses an admin may move an enquiry to from `from`. ADMITTED is never offered: it is only reached by
// confirming an application with evidence (application.service confirmAdmission).
export function allowedTransitions(from: EnquiryStatus): EnquiryStatus[] {
  if (from === 'ADMITTED') return ['CLOSED'];
  if (from === 'REJECTED' || from === 'WITHDRAWN' || from === 'CLOSED' || from === 'NOT_INTERESTED') return ['CONTACTED'];
  const manual = PIPELINE.filter((s) => s !== 'ADMITTED' && s !== 'NEW');
  if (from === 'ON_HOLD') return [...manual, 'NOT_INTERESTED', 'REJECTED', 'WITHDRAWN', 'CLOSED'];
  const i = pipelineIndex(from);
  const forward = manual.filter((s) => pipelineIndex(s) > i);
  const back = i > 1 ? [PIPELINE[i - 1]!] : [];
  return [...back, ...forward, ...SIDE_STATUSES];
}

// A reason is needed when pausing, ending, reopening or going backwards.
export function reasonRequired(from: EnquiryStatus, to: EnquiryStatus) {
  if ((SIDE_STATUSES as readonly string[]).includes(to)) return true;
  if (!isOpen(from)) return true;
  return pipelineIndex(to) >= 0 && pipelineIndex(from) >= 0 && pipelineIndex(to) < pipelineIndex(from);
}

// Statuses that need a recorded college application first.
export const APPLICATION_GATES: Partial<Record<EnquiryStatus, { statuses: string[]; message: string }>> = {
  SUBMITTED: { statuses: ['submitted', 'offer_received', 'admitted'], message: 'Record a submitted college application first' },
  OFFER_RECEIVED: { statuses: ['offer_received', 'admitted'], message: 'Record the offer on a college application first' },
};

// Statuses the student is emailed about.
export const NOTIFY_STATUSES: EnquiryStatus[] = ['INTERESTED', 'COUNSELLING_SCHEDULED', 'COUNSELLING_COMPLETED', 'DOCUMENTS_PENDING', 'APPLICATION_IN_PROGRESS', 'SUBMITTED', 'OFFER_RECEIVED', 'ADMITTED', 'ON_HOLD', 'NOT_INTERESTED', 'REJECTED', 'CLOSED'];

// What the student sees.
export const STUDENT_LABELS: Record<EnquiryStatus, string> = {
  NEW: 'Received',
  CONTACT_PENDING: 'We will call you soon',
  CONTACTED: 'In touch with you',
  INTERESTED: 'Exploring your options',
  ELIGIBILITY_CHECK: 'Checking your eligibility',
  COUNSELLING_SCHEDULED: 'Counselling scheduled',
  COUNSELLING_COMPLETED: 'Counselling completed',
  DOCUMENTS_PENDING: 'Documents needed',
  APPLICATION_IN_PROGRESS: 'Application in progress',
  SUBMITTED: 'Application submitted',
  OFFER_RECEIVED: 'Offer received',
  ADMITTED: 'Admission confirmed',
  ON_HOLD: 'On hold',
  NOT_INTERESTED: 'Closed at your request',
  REJECTED: 'Not successful',
  WITHDRAWN: 'Withdrawn',
  CLOSED: 'Closed',
};
