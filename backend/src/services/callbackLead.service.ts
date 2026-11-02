import { env } from '../config/env.js';
import { CallbackLeadModel } from '../models/CallbackLead.js';
import { enqueueEmail } from './email.service.js';
import { counsellors } from './enquiryShared.js';

export type CallbackLeadInput = { name: string; mobile: string; role: 'student' | 'parent'; education: string; interest: string; consent: boolean };

const EDUCATION: Record<string, string> = { class_10: 'Class 10', class_12: 'Class 12', diploma: 'Diploma', undergraduate: 'Undergraduate', postgraduate: 'Postgraduate', other: 'Other' };
const frontend = (path: string) => `${env.FRONTEND_URL.replace(/\/+$/, '')}${path}`;

// Saves a landing-page callback request and emails the enquiry team (admins who handle enquiries plus
// ADMIN_NOTIFY_EMAILS). A repeat request from the same number within 10 minutes is accepted but not re-sent.
export async function createCallbackLead(input: CallbackLeadInput) {
  const recent = await CallbackLeadModel.exists({ mobile: input.mobile, createdAt: { $gte: new Date(Date.now() - 10 * 60_000) } });
  if (recent) return { received: true };
  const lead = await CallbackLeadModel.create({ name: input.name, mobile: input.mobile, role: input.role, education: input.education, interest: input.interest, consentAt: new Date() });
  const recipients = new Set([...(await counsellors()).map((a) => a.email), ...env.ADMIN_NOTIFY_EMAILS]);
  for (const to of recipients) {
    await enqueueEmail({
      to,
      template: 'callback_lead',
      params: { name: lead.name, role: lead.role === 'parent' ? 'Parent / guardian' : 'Student', education: EDUCATION[lead.education] ?? lead.education, interest: lead.interest || 'Not sure yet' },
      // The phone number goes only to staff and is kept out of the stored (searchable) email parameters.
      secretParams: { mobile: lead.mobile, link: frontend('/admin/enquiries') },
      dedupeKey: `callback-lead:${String(lead._id)}:${to}`,
      related: { type: 'callback_lead', id: String(lead._id) },
    });
  }
  return { received: true };
}
