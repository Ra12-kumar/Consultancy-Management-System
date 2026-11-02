import { env } from '../config/env.js';

// Branded, responsive emails (inline styles for email clients) with a plain-text alternative.
// Templates receive only what they need: names and action links. Never passwords or session tokens.

export type TemplateName = 'welcome_verify' | 'verify_email' | 'reset_password' | 'password_changed' | 'admin_invite' | 'existing_account' | 'admin_new_student'
  | 'enquiry_received_admin' | 'enquiry_ack' | 'enquiry_assigned' | 'enquiry_status' | 'enquiry_message' | 'documents_requested'
  | 'appointment_scheduled' | 'appointment_updated' | 'appointment_cancelled' | 'appointment_reminder' | 'appointment_change_request'
  | 'scholarship_received' | 'scholarship_new_admin' | 'scholarship_update' | 'scholarship_decision'
  | 'feedback_ack' | 'feedback_admin' | 'feedback_response' | 'data_request_admin' | 'data_request_update'
  | 'announcement' | 'payment_request' | 'payment_receipt' | 'security_notice'
  | 'import_report' | 'counsellor_invite' | 'followup_digest' | 'callback_lead';
type Params = Record<string, string>;
type Rendered = { subject: string; html: string; text: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout({ heading, paragraphs, code, action, footnote }: { heading: string; paragraphs: string[]; code?: string; action?: { label: string; url: string }; footnote?: string }): { html: string; text: string } {
  const app = esc(env.APP_NAME);
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1f2a44">${esc(p)}</p>`).join('');
  // A one-time code, large and easy to copy.
  const codeBox = code ? `<p style="margin:0 0 20px;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:#0B1F44;font-family:Consolas,monospace">${esc(code)}</p>` : '';
  const button = action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:#C9A227"><a href="${esc(action.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#0B1F44;text-decoration:none;border-radius:8px">${esc(action.label)}</a></td></tr></table>
       <p style="margin:0 0 16px;font-size:12px;line-height:18px;color:#5b6478">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;color:#0B1F44">${esc(action.url)}</span></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f9">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif">
<tr><td style="background:#0B1F44;padding:20px 28px;font-size:18px;font-weight:700;color:#ffffff">${app}<span style="color:#C9A227">.</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#0B1F44">${esc(heading)}</h1>
${body}${codeBox}${button}
${footnote ? `<p style="margin:0;font-size:12px;line-height:18px;color:#5b6478">${esc(footnote)}</p>` : ''}
</td></tr>
<tr><td style="background:#f8f9fc;padding:16px 28px;font-size:11px;line-height:16px;color:#7a8296">You received this email from ${app} about your account. Please do not reply with passwords or personal documents.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [heading, '', ...paragraphs, ...(code ? ['', `Your code: ${code}`] : []), ...(action ? ['', `${action.label}: ${action.url}`] : []), ...(footnote ? ['', footnote] : []), '', `— ${env.APP_NAME}`].join('\n');
  return { html, text };
}

// The final email: the template, then any admin customisation (subject, introduction).
export function renderEmail(template: TemplateName, p: Params): Rendered {
  return applyOverride(template, p, renderBase(template, p));
}

function renderBase(template: TemplateName, p: Params): Rendered {
  const app = env.APP_NAME;
  switch (template) {
    case 'welcome_verify':
      return {
        subject: `Welcome to ${app}: please verify your email`,
        ...layout({
          heading: `Welcome, ${p.name}!`,
          paragraphs: ['Thank you for registering. Enter this code on the verification page to activate your student account:'],
          code: p.code!,
          action: { label: 'Open the verification page', url: p.link! },
          footnote: 'The code expires in 10 minutes and can be used once. Never share it with anyone, including our staff. If you did not create this account, you can ignore this email.',
        }),
      };
    case 'verify_email':
      return {
        subject: `${app}: your email verification code`,
        ...layout({
          heading: 'Confirm your email address',
          paragraphs: [`Hi ${p.name}, enter this code to confirm the email address of your ${app} account:`],
          code: p.code!,
          action: { label: 'Open the verification page', url: p.link! },
          footnote: 'The code expires in 10 minutes and can be used once. Never share it with anyone, including our staff.',
        }),
      };
    case 'reset_password':
      return {
        subject: `${app}: reset your password`,
        ...layout({
          heading: 'Reset your password',
          paragraphs: [`Hi ${p.name}, we received a request to reset your password. Choose a new one with the button below.`],
          action: { label: 'Choose a new password', url: p.link! },
          footnote: 'This link expires in 30 minutes and can be used once. If you did not ask for this, ignore this email: your password stays the same.',
        }),
      };
    case 'password_changed':
      return {
        subject: `${app}: your password was changed`,
        ...layout({
          heading: 'Your password was changed',
          paragraphs: [`Hi ${p.name}, the password for your ${app} account was just changed and every device was signed out.`, 'If this was not you, reset your password immediately and contact us.'],
        }),
      };
    case 'counsellor_invite':
      return {
        subject: `${app}: set up your counsellor account`,
        ...layout({
          heading: `Hi ${p.name}, you have been added as a counsellor`,
          paragraphs: [`${p.invitedBy} added you as a counsellor at ${app}. Choose your password to start working on the enquiries assigned to you.`],
          action: { label: 'Set my password', url: p.link! },
          footnote: 'This link expires in 72 hours and can be used once.',
        }),
      };
    case 'callback_lead':
      // The subject is stored with the delivery record, so it never includes the phone number.
      return {
        subject: `${app}: callback requested by ${p.name}`,
        ...layout({
          heading: 'New callback request from the website',
          paragraphs: [`${p.name} (${p.role}) asked for a call back.`, `Mobile: ${p.mobile}`, `Current education: ${p.education}. Interested in: ${p.interest}.`, 'They agreed to be contacted about this request only.'],
          action: { label: 'Open enquiries', url: p.link! },
        }),
      };
    case 'followup_digest':
      return {
        subject: `${app}: ${p.today} follow-up${p.today === '1' ? '' : 's'} today, ${p.overdue} overdue`,
        ...layout({
          heading: `Good morning, ${p.name}`,
          paragraphs: [`You have ${p.today} follow-up${p.today === '1' ? '' : 's'} due today and ${p.overdue} overdue on your assigned enquiries.`],
          action: { label: 'Open my follow-ups', url: p.link! },
        }),
      };
    case 'admin_invite':
      return {
        subject: `${app}: set up your administrator account`,
        ...layout({
          heading: `Hi ${p.name}, you have been added as an administrator`,
          paragraphs: [`${p.invitedBy} added you as an administrator of ${app}. Choose your password to activate the account.`],
          action: { label: 'Set my password', url: p.link! },
          footnote: 'This link expires in 72 hours and can be used once.',
        }),
      };
    case 'existing_account':
      return {
        subject: `${app}: someone tried to register with your email`,
        ...layout({
          heading: 'You already have an account',
          paragraphs: [`Hi ${p.name}, someone (maybe you) tried to create a new ${app} account with this email address. You already have one.`, 'If you forgot your password, you can reset it from the sign-in page. If this was not you, no action is needed.'],
          action: { label: 'Go to sign in', url: p.link! },
        }),
      };
    case 'admin_new_student':
      return {
        subject: `${app}: new student registration`,
        ...layout({
          heading: 'A new student registered',
          paragraphs: [`${p.name} created a student account.`, 'Open the admin dashboard to view their details.'],
          action: { label: 'Open students', url: p.link! },
        }),
      };
    // ---- Enquiries (Stage 3). Params never include internal notes. ----
    case 'enquiry_received_admin':
      return {
        subject: `New enquiry ${p.reference}: ${p.course}`,
        ...layout({
          heading: `New admission enquiry ${p.reference}`,
          paragraphs: [`${p.name} enquired about ${p.course}${p.colleges ? ` (${p.colleges})` : ''}.`, `Admission year: ${p.year}. Open the enquiry to assign a counsellor and get in touch.`],
          action: { label: 'Open enquiry', url: p.link! },
        }),
      };
    case 'enquiry_ack':
      return {
        subject: `We received your enquiry ${p.reference}`,
        ...layout({
          heading: 'Thank you, we have your enquiry',
          paragraphs: [`Hi ${p.name}, your admission enquiry for ${p.course} has been received. Your reference number is ${p.reference}.`, 'A counsellor will get in touch with you soon. You can follow its progress in your student dashboard.'],
          action: { label: 'Track my enquiry', url: p.link! },
          footnote: 'Fee estimates shown when you enquired are based on published college fees at that time. We confirm current amounts before you pay anything.',
        }),
      };
    case 'enquiry_assigned':
      return {
        subject: `Enquiry ${p.reference} assigned to you`,
        ...layout({
          heading: `You are now the counsellor for ${p.reference}`,
          paragraphs: [`${p.assignedBy} assigned ${p.name}'s enquiry about ${p.course} to you.`],
          action: { label: 'Open enquiry', url: p.link! },
        }),
      };
    case 'enquiry_status':
      return {
        subject: `Update on your enquiry ${p.reference}: ${p.status}`,
        ...layout({
          heading: p.status!,
          paragraphs: [`Hi ${p.name}, the status of your enquiry ${p.reference} is now “${p.status}”.`, ...(p.message ? [p.message] : [])],
          action: { label: 'View details', url: p.link! },
        }),
      };
    case 'enquiry_message':
      return {
        subject: `New message about enquiry ${p.reference}`,
        ...layout({
          heading: `New message about ${p.reference}`,
          paragraphs: [`${p.from} wrote:`, p.body!],
          action: { label: 'Open the conversation', url: p.link! },
        }),
      };
    case 'documents_requested':
      return {
        subject: `Documents needed for enquiry ${p.reference}`,
        ...layout({
          heading: 'We need a few documents',
          paragraphs: [`Hi ${p.name}, to continue with your enquiry ${p.reference} we need: ${p.documents}.`, 'Your counsellor will tell you how to share them securely. Please do not send documents by replying to this email.'],
          action: { label: 'View requested documents', url: p.link! },
        }),
      };
    case 'appointment_scheduled':
    case 'appointment_updated':
      return {
        subject: `${template === 'appointment_scheduled' ? 'Counselling session booked' : 'Counselling session changed'}: ${p.when}`,
        ...layout({
          heading: template === 'appointment_scheduled' ? 'Your counselling session is booked' : 'Your counselling session has changed',
          paragraphs: [`Hi ${p.name}, your ${p.mode} counselling session for enquiry ${p.reference} is on ${p.when} (India time) with ${p.counsellor}.`, ...(p.details ? [`Details: ${p.details}`] : []), 'Please confirm it, or ask for another time, from your dashboard.'],
          action: { label: 'Confirm or reschedule', url: p.link! },
        }),
      };
    case 'appointment_cancelled':
      return {
        subject: `Counselling session cancelled: ${p.when}`,
        ...layout({
          heading: 'Your counselling session was cancelled',
          paragraphs: [`Hi ${p.name}, the session on ${p.when} (India time) for enquiry ${p.reference} has been cancelled.`, ...(p.reason ? [`Reason: ${p.reason}`] : []), 'Your counsellor will arrange a new time with you.'],
          action: { label: 'Open my appointments', url: p.link! },
        }),
      };
    case 'appointment_reminder':
      return {
        subject: `Reminder: counselling session ${p.when}`,
        ...layout({
          heading: 'Your counselling session is coming up',
          paragraphs: [`Hi ${p.name}, this is a reminder of your ${p.mode} session on ${p.when} (India time) with ${p.counsellor} about enquiry ${p.reference}.`, ...(p.details ? [`Details: ${p.details}`] : [])],
          action: { label: 'View appointment', url: p.link! },
        }),
      };
    case 'appointment_change_request':
      return {
        subject: `${p.name} ${p.action} the session on ${p.when}`,
        ...layout({
          heading: `Appointment ${p.action}`,
          paragraphs: [`${p.name} ${p.action} the session on ${p.when} (India time) for enquiry ${p.reference}.`, ...(p.note ? [`Their note: ${p.note}`] : [])],
          action: { label: 'Open appointments', url: p.link! },
        }),
      };
    default: {
      const extra = renderScholarshipEmail(template, p) ?? renderSupportEmail(template, p) ?? renderStage7Email(template, p);
      if (extra) return extra;
      throw new Error(`Unknown email template: ${String(template)}`);
    }
  }
}

// Scholarship emails (Stage 4), dispatched from renderEmail's default branch above via renderScholarshipEmail.
export function renderScholarshipEmail(template: TemplateName, p: Params): Rendered | null {
  switch (template) {
    case 'scholarship_received':
      return {
        subject: `Scholarship application ${p.reference} received`,
        ...layout({
          heading: 'We received your scholarship application',
          paragraphs: [`Hi ${p.name}, your application for “${p.scholarship}” has been received. Your reference is ${p.reference}.`, 'The eligibility shown when you applied is preliminary. Our team will review your application and let you know the decision.'],
          action: { label: 'View my scholarships', url: p.link! },
        }),
      };
    case 'scholarship_new_admin':
      return {
        subject: `New scholarship application ${p.reference}`,
        ...layout({ heading: `New scholarship application ${p.reference}`, paragraphs: [`${p.name} applied for “${p.scholarship}”.`], action: { label: 'Review application', url: p.link! } }),
      };
    case 'scholarship_update':
      return {
        subject: `Scholarship application ${p.reference}: ${p.status}`,
        ...layout({
          heading: p.status!,
          paragraphs: [`Hi ${p.name}, your application ${p.reference} for “${p.scholarship}” is now “${p.status}”.`, ...(p.note ? [p.note] : [])],
          action: { label: 'View details', url: p.link! },
        }),
      };
    case 'scholarship_decision':
      return {
        subject: p.decision === 'approved' ? `Scholarship approved: ${p.scholarship}` : `Scholarship decision: ${p.scholarship}`,
        ...layout({
          heading: p.decision === 'approved' ? 'Congratulations, your scholarship is approved' : 'Your scholarship application was not approved',
          paragraphs: [`Hi ${p.name}, this is the decision on your application ${p.reference} for “${p.scholarship}”.`, ...(p.note ? [p.note] : [])],
          action: { label: 'View details', url: p.link! },
        }),
      };
    default:
      return null;
  }
}

// Feedback and personal-data request emails (Stage 5).
export function renderSupportEmail(template: TemplateName, p: Params): Rendered | null {
  switch (template) {
    case 'feedback_ack':
      return {
        subject: 'Thank you for your feedback',
        ...layout({ heading: 'Thank you for your feedback', paragraphs: [`Hi ${p.name}, we have received your feedback. If it needs a reply, our team will respond in your dashboard.`], action: { label: 'View my feedback', url: p.link! } }),
      };
    case 'feedback_admin':
      return {
        subject: `New feedback (${p.rating}/5)`,
        ...layout({ heading: 'New student feedback', paragraphs: [`${p.name} rated their experience ${p.rating} out of 5.`], action: { label: 'Open feedback', url: p.link! } }),
      };
    case 'feedback_response':
      return {
        subject: 'Reply to your feedback',
        ...layout({ heading: 'We replied to your feedback', paragraphs: [`Hi ${p.name},`, p.body!], action: { label: 'Open the conversation', url: p.link! } }),
      };
    case 'data_request_admin':
      return {
        subject: `New personal data request ${p.reference} (${p.type})`,
        ...layout({
          heading: 'A student made a personal data request',
          paragraphs: [`Request ${p.reference} asks for ${p.type === 'deletion' ? 'account deletion' : 'a correction of their details'}.`],
          action: { label: 'Review requests', url: p.link! },
        }),
      };
    case 'data_request_update':
      return {
        subject: `Your ${p.type} request ${p.reference} was ${p.status}`,
        ...layout({
          heading: p.status === 'completed' ? (p.type === 'deletion' ? 'Your account has been deleted' : 'Your details were corrected') : 'Your request was not completed',
          paragraphs: [
            `Hi ${p.name}, your ${p.type} request ${p.reference} was ${p.status}.`,
            ...(p.note ? [p.note] : []),
            ...(p.type === 'deletion' && p.status === 'completed' ? ['Your personal details and uploaded files have been removed. This is the last email we will send you.'] : []),
          ],
        }),
      };
    default:
      return null;
  }
}

// Announcements, payments and security notices (Stage 7).
export function renderStage7Email(template: TemplateName, p: Params): Rendered | null {
  switch (template) {
    case 'announcement':
      return { subject: p.title!, ...layout({ heading: p.title!, paragraphs: [`Hi ${p.name},`, ...p.body!.split(/\n{2,}/)], action: { label: 'Open my dashboard', url: p.link! } }) };
    case 'payment_request':
      return {
        subject: `Payment request ${p.reference}: ${p.amount}`,
        ...layout({
          heading: 'A payment request is waiting',
          paragraphs: [`Hi ${p.name}, ${p.description || 'your consultancy service charge'} of ${p.amount} is due (reference ${p.reference}).`, 'This is Udaan’s own service charge. Official college fees are always paid to the college directly.'],
          action: { label: 'Review and pay', url: p.link! },
        }),
      };
    case 'payment_receipt':
      return {
        subject: `Payment received – receipt ${p.receipt}`,
        ...layout({
          heading: 'Thank you, we received your payment',
          paragraphs: [`Hi ${p.name}, we received ${p.amount} for ${p.description || 'the consultancy service charge'}.`, `Receipt number: ${p.receipt}. Payment reference: ${p.reference}.`],
          action: { label: 'View receipt', url: p.link! },
        }),
      };
    case 'import_report':
      return {
        subject: `College data import ${p.status!.replace(/_/g, ' ')}: ${p.file}`,
        ...layout({
          heading: `Import ${p.status!.replace(/_/g, ' ')}`,
          paragraphs: [`Hi ${p.name}, the import of ${p.file} from ${p.source} has ${p.status!.replace(/_/g, ' ')}.`, `Summary: ${p.summary}.`, 'Open the import centre for details, row errors and the review queue.'],
          action: { label: 'Open college data imports', url: p.link! },
        }),
      };
    case 'security_notice':
      return {
        subject: `Security notice: ${p.change}`,
        ...layout({ heading: p.change!, paragraphs: [`Hi ${p.name}, this is a confirmation that the following change was made to your account: ${p.change}.`, 'If this was not you, reset your password and contact the administrator immediately.'] }),
      };
    default:
      return null;
  }
}

// ---- Admin customisation (subject and an introductory paragraph) ----

type Override = { subject: string; intro: string };
const overrides = new Map<string, Override>();
// Loaded at start-up and after every change (services/settings.service.ts).
export function setTemplateOverrides(list: Array<{ template: string } & Override>) {
  overrides.clear();
  for (const o of list) overrides.set(o.template, { subject: o.subject, intro: o.intro });
}
// Only these placeholders can be used; everything else in braces is removed.
export const PLACEHOLDERS = ['name', 'reference', 'app'] as const;
const fill = (text: string, p: Params) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => (k === 'app' ? env.APP_NAME : (PLACEHOLDERS as readonly string[]).includes(k) ? (p[k] ?? '') : ''));

function applyOverride(template: TemplateName, p: Params, r: Rendered): Rendered {
  const o = overrides.get(template);
  if (!o) return r;
  const subject = o.subject ? fill(o.subject, p).slice(0, 200) : r.subject;
  if (!o.intro) return { ...r, subject };
  const intro = fill(o.intro, p);
  const para = `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1f2a44">${esc(intro)}</p>`;
  return { subject, html: r.html.replace('</h1>', `</h1>${para}`), text: r.text.replace(/^(.*)\n/, `$1\n\n${intro}\n`) };
}
