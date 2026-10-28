"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/Feedback";
import { LoadState, PageTitle, Pager, fmtDate } from "@/features/admin/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Page, SiteInfo } from "@/features/content/ContentPage";
import { useApiData } from "@/hooks/useApiData";
import { formatINR, rupeesToPaise } from "@/lib/format";
import { SafeMarkdown } from "@/lib/markdown";
import { api, apiGet, apiPost, apiPut } from "@/services/api";
import type { ApiError, PageMeta, User } from "@/types/api";

const control = "min-h-11 rounded-xl border border-line bg-surface px-3 text-sm";
const errMsg = (e: unknown) => (e as ApiError)?.message ?? "Something went wrong";

// ---- Two-step sign-in (admin account settings) ----

export function MfaCard() {
  const { user, setUser } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  if (!user || user.role !== "admin") return null;
  const run = async (fn: () => Promise<void>) => {
    setState({ busy: true });
    try {
      await fn();
      setState({ busy: false });
    } catch (e) {
      setState({ busy: false, error: errMsg(e) });
    }
  };
  return (
    <Card>
      <h2 className="font-semibold">Two-step sign-in</h2>
      <p className="mt-1 text-sm text-muted">Protect your admin account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) as well as your password.</p>
      {recovery && (
        <div className="mt-4">
          <Alert tone="warning" title="Save these recovery codes now">
            Each code works once if you lose your phone. They will not be shown again.
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
              {recovery.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      {user.mfaEnabled ? (
        <div className="mt-4 space-y-3">
          <Badge tone="success">On</Badge>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const { user: u } = await apiPost<{ user: User }>("/auth/mfa/disable", { password, code: code.trim() });
                setUser(u);
                setCode("");
                setPassword("");
                setRecovery(null);
              });
            }}
          >
            <TextField label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <TextField label="Code or recovery code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} />
            <div className="sm:col-span-2">
              <Button type="submit" variant="danger" size="sm" disabled={state.busy || !password || !code.trim()}>
                Turn off two-step sign-in
              </Button>
            </div>
          </form>
        </div>
      ) : !setup ? (
        <Button className="mt-4" size="sm" disabled={state.busy} onClick={() => run(async () => setSetup(await apiPost("/auth/mfa/setup")))}>
          Set up two-step sign-in
        </Button>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await apiPost<{ recoveryCodes: string[] }>("/auth/mfa/enable", { code: code.trim() });
              setRecovery(r.recoveryCodes);
              setUser({ ...user, mfaEnabled: true });
              setSetup(null);
              setCode("");
            });
          }}
        >
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              In your authenticator app, add an account using this key: <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono break-all">{setup.secret}</code>
              <span className="block text-xs text-muted">
                On a phone you can also{" "}
                <a href={setup.otpauthUrl} className="underline">
                  open this link
                </a>{" "}
                to add it.
              </span>
            </li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
          <Button type="submit" size="sm" disabled={state.busy || code.trim().length !== 6}>
            Turn on
          </Button>
        </form>
      )}
      {state.error && (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      )}
    </Card>
  );
}

// ---- Site settings and email templates (settings.manage) ----

type TemplateRow = { template: string; label: string; subject: string; intro: string; customised: boolean; preview: { subject: string; text: string } };

function TemplateEditor({ t, onSaved }: { t: TemplateRow; onSaved: () => void }) {
  const [subject, setSubject] = useState(t.subject);
  const [intro, setIntro] = useState(t.intro);
  const [preview, setPreview] = useState(t.preview);
  const [error, setError] = useState("");
  async function save(reset = false) {
    setError("");
    try {
      const r = await apiPut<{ preview: TemplateRow["preview"] }>(`/admin/email-templates/${t.template}`, reset ? { subject: "", intro: "" } : { subject: subject.trim(), intro: intro.trim() });
      setPreview(r.preview);
      if (reset) {
        setSubject("");
        setIntro("");
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">
        {t.label} {t.customised && <Badge tone="gold">Customised</Badge>}
      </summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <TextField label="Subject (leave empty for the default)" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} hint="You can use {{name}}, {{reference}} and {{app}}" />
          <TextAreaField label="Extra introduction (optional)" value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={1000} hint="Added at the top. Links and references are always added by the system." />
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save()}>
              Save
            </Button>
            {t.customised && (
              <Button size="sm" variant="ghost" onClick={() => save(true)}>
                Back to default
              </Button>
            )}
          </div>
        </div>
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="text-xs text-muted">Preview (sample data)</p>
          <p className="mt-1 font-semibold">{preview.subject}</p>
          <pre className="mt-2 font-sans text-xs whitespace-pre-wrap text-muted">{preview.text}</pre>
        </div>
      </div>
    </details>
  );
}

export function AdminSiteSettings() {
  const settings = useApiData((signal) => apiGet<{ organisation: SiteInfo["organisation"] }>("/admin/settings/site", { signal }), []);
  const templates = useApiData((signal) => apiGet<TemplateRow[]>("/admin/email-templates", { signal }), []);
  const [org, setOrg] = useState<SiteInfo["organisation"] | null>(null);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const o = org ?? settings.data?.organisation;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!o) return;
    try {
      await apiPut("/admin/settings/site", { organisation: o });
      setFlash({ tone: "success", text: "Saved. The contact page now shows these details." });
      settings.reload();
    } catch (err) {
      setFlash({ tone: "error", text: errMsg(err) });
    }
  }
  const field = (k: keyof SiteInfo["organisation"], label: string, extra: object = {}) => <TextField label={label} value={o?.[k] ?? ""} onChange={(e) => setOrg({ ...o!, [k]: e.target.value })} {...extra} />;
  return (
    <div className="space-y-6">
      <PageTitle title="Site settings" subtitle="Organisation contact details and the wording of system emails." />
      <Card>
        <h2 className="font-semibold">Organisation details</h2>
        {!o ? (
          <LoadState status={settings.status} error={settings.error} reload={settings.reload} rows={2} />
        ) : (
          <form onSubmit={save} className="mt-3 grid gap-4 sm:grid-cols-2">
            {field("name", "Organisation name")}
            {field("supportEmail", "Support email", { type: "email" })}
            {field("supportPhone", "Support phone")}
            {field("whatsapp", "WhatsApp number")}
            {field("officeHours", "Office hours")}
            <div className="sm:col-span-2">
              <TextAreaField label="Address" value={o.address} onChange={(e) => setOrg({ ...o, address: e.target.value })} maxLength={400} />
            </div>
            {flash && (
              <div className="sm:col-span-2">
                <Alert tone={flash.tone}>{flash.text}</Alert>
              </div>
            )}
            <div>
              <Button type="submit">Save details</Button>
            </div>
          </form>
        )}
      </Card>
      <section className="space-y-3" aria-labelledby="tpl">
        <h2 id="tpl" className="font-semibold">
          Email templates
        </h2>
        {!templates.data ? <LoadState status={templates.status} error={templates.error} reload={templates.reload} /> : templates.data.map((t) => <TemplateEditor key={t.template} t={t} onSaved={templates.reload} />)}
      </section>
    </div>
  );
}

// ---- Website content and announcements (content.manage) ----

type AdminPage = Page & { status: string; revisions: Array<{ id: string; title: string; savedAt: string }> };
const PAGE_LABELS: Record<string, string> = { about: "About us", faq: "FAQ", privacy: "Privacy policy", terms: "Terms and conditions", "admission-process": "Admission process", contact: "Contact" };

function PageEditor({ page, onSaved }: { page: AdminPage; onSaved: () => void }) {
  const [form, setForm] = useState({ title: page.title || PAGE_LABELS[page.slug]!, intro: page.intro, body: page.body, faqs: page.faqs });
  const [preview, setPreview] = useState(false);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setFlash(null);
    try {
      await fn();
      setFlash({ tone: "success", text: ok });
      onSaved();
    } catch (e) {
      setFlash({ tone: "error", text: errMsg(e) });
    }
  };
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">
        {PAGE_LABELS[page.slug]} {page.status === "default" ? <Badge>Built-in text</Badge> : <Badge tone="success">Edited {fmtDate(page.updatedAt)}</Badge>}
      </summary>
      <div className="mt-3 space-y-3">
        <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} />
        <TextAreaField label="Introduction" value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} maxLength={600} />
        <TextAreaField label="Page text" className="min-h-64 font-mono" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={30000} hint="Use ## for a heading, - for a list item, **bold**, and [link text](https://…). A blank line starts a new paragraph." />
        {page.slug === "faq" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Questions</legend>
            {form.faqs.map((f, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
                <TextField label="Question" value={f.question} onChange={(e) => setForm({ ...form, faqs: form.faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
                <TextAreaField label="Answer" value={f.answer} onChange={(e) => setForm({ ...form, faqs: form.faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })} />
                <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, faqs: form.faqs.filter((_, j) => j !== i) })}>
                  Remove question
                </Button>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, faqs: [...form.faqs, { question: "", answer: "" }] })}>
              Add question
            </Button>
          </fieldset>
        )}
        {preview && (
          <div className="rounded-xl border border-dashed border-line p-4">
            <p className="text-xs text-muted">Preview</p>
            <h3 className="mt-1 text-2xl font-bold">{form.title}</h3>
            {form.intro && <p className="mt-2 text-muted">{form.intro}</p>}
            <div className="mt-4">
              <SafeMarkdown text={form.body} />
            </div>
          </div>
        )}
        {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run(() => apiPut(`/admin/pages/${page.slug}`, { ...form, faqs: form.faqs.filter((f) => f.question.trim() && f.answer.trim()) }), "Published.")} disabled={form.title.trim().length < 2}>
            Publish
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPreview(!preview)}>
            {preview ? "Hide preview" : "Preview"}
          </Button>
          {page.status !== "default" && (
            <Button size="sm" variant="ghost" onClick={() => window.confirm("Go back to the built-in text?") && run(() => api("DELETE", `/admin/pages/${page.slug}`), "Back to the built-in text.")}>
              Use built-in text
            </Button>
          )}
        </div>
        {page.revisions.length > 0 && (
          <div className="text-sm">
            <p className="font-medium">Earlier versions</p>
            <ul className="mt-1 space-y-1">
              {page.revisions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="text-muted">{fmtDate(r.savedAt)}</span>
                  <Button size="sm" variant="ghost" onClick={() => run(() => apiPost(`/admin/pages/${page.slug}/restore/${r.id}`), "Earlier version restored.")}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

type Announcement = { id: string; title: string; body: string; audience: string; sendEmail: boolean; expiresAt: string | null; status: string; emailedCount: number; createdAt: string };
const AUDIENCE_LABELS: Record<string, string> = { public: "Website banner (everyone)", students_all: "All students (dashboard)", students_verified: "Students with a verified email", students_open_enquiry: "Students with an open enquiry" };

export function AdminContent() {
  const pages = useApiData((signal) => apiGet<AdminPage[]>("/admin/pages", { signal }), []);
  const [page, setPage] = useState(1);
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<Announcement[]>("GET", `/admin/announcements?page=${page}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [page]);
  const [form, setForm] = useState({ title: "", body: "", audience: "students_all", sendEmail: false, expiresAt: "" });
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  async function publish(e: FormEvent) {
    e.preventDefault();
    if (form.sendEmail && !window.confirm("Email this announcement to the chosen students now?")) return;
    try {
      const a = await apiPost<Announcement>("/admin/announcements", { ...form, sendEmail: form.audience !== "public" && form.sendEmail, expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59+05:30` : null });
      setFlash({ tone: "success", text: a.sendEmail ? `Published and emailed to ${a.emailedCount} student(s).` : "Published." });
      setForm({ title: "", body: "", audience: "students_all", sendEmail: false, expiresAt: "" });
      list.reload();
    } catch (err) {
      setFlash({ tone: "error", text: errMsg(err) });
    }
  }
  return (
    <div className="space-y-8">
      <PageTitle title="Website content" subtitle="Edit the public information pages and send announcements. Changes appear on the site at once." />
      <section className="space-y-3" aria-labelledby="pages">
        <h2 id="pages" className="font-semibold">
          Pages
        </h2>
        {!pages.data ? <LoadState status={pages.status} error={pages.error} reload={pages.reload} /> : pages.data.map((p) => <PageEditor key={`${p.slug}-${p.updatedAt}`} page={p} onSaved={pages.reload} />)}
      </section>
      <section className="space-y-3" aria-labelledby="ann">
        <h2 id="ann" className="font-semibold">
          Announcements
        </h2>
        <Card>
          <form onSubmit={publish} className="grid gap-3 sm:grid-cols-2">
            <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} />
            <SelectField label="Who sees it" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              {Object.entries(AUDIENCE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </SelectField>
            <div className="sm:col-span-2">
              <TextAreaField label="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={2000} />
            </div>
            <TextField label="Show until (optional)" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            {form.audience !== "public" && (
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} /> Also email these students
              </label>
            )}
            {flash && (
              <div className="sm:col-span-2">
                <Alert tone={flash.tone}>{flash.text}</Alert>
              </div>
            )}
            <div>
              <Button type="submit" disabled={form.title.trim().length < 3 || form.body.trim().length < 3}>
                Publish announcement
              </Button>
            </div>
          </form>
        </Card>
        {!list.data ? (
          <LoadState status={list.status} error={list.error} reload={list.reload} rows={2} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="No announcements yet" />
        ) : (
          <>
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {list.data.items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{a.title}</span>
                    <span className="block text-muted">
                      {AUDIENCE_LABELS[a.audience]} · {fmtDate(a.createdAt)}
                      {a.sendEmail && ` · emailed to ${a.emailedCount}`}
                      {a.expiresAt && ` · until ${fmtDate(a.expiresAt)}`}
                    </span>
                  </span>
                  <Badge tone={a.status === "active" ? "success" : "neutral"}>{a.status}</Badge>
                  {a.status === "active" && (
                    <Button size="sm" variant="ghost" onClick={async () => { await apiPost(`/admin/announcements/${a.id}/withdraw`); list.reload(); }}>
                      Withdraw
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Pager meta={list.data.meta} onPage={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

// ---- Payments (payments.manage) ----

type AdminPayment = { id: string; reference: string; description: string; amountMinor: number; status: string; receiptNumber: string | null; paidAt: string | null; razorpayPaymentId: string | null; enquiry: string | null; createdAt: string; studentName: string; studentEmail: string };
const PAY_TONE: Record<string, "success" | "warning" | "neutral" | "gold" | "danger"> = { requested: "gold", pending: "warning", paid: "success", failed: "danger", cancelled: "neutral" };

export function AdminPayments() {
  const [f, setF] = useState({ status: "", page: 1 });
  const status = useApiData((signal) => apiGet<{ enabled: boolean }>("/admin/payments/status", { signal }), []);
  const list = useApiData(async (signal) => {
    const { data, meta } = await api<AdminPayment[]>("GET", `/admin/payments?page=${f.page}${f.status ? `&status=${f.status}` : ""}`, { signal });
    return { items: data, meta: meta as PageMeta };
  }, [f.status, f.page]);
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <PageTitle title="Payments" subtitle="Online payments of the EduPath service charge (Razorpay). Official college fees are never collected here. Create a payment request from an enquiry." />
      {status.data && !status.data.enabled && (
        <Alert tone="warning" title="Online payment is switched off">
          Add this project’s Razorpay keys (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET) to the settings file and restart the API. Until then students can see requests but cannot pay online.
        </Alert>
      )}
      <select aria-label="Status" className={control} value={f.status} onChange={(e) => setF({ status: e.target.value, page: 1 })}>
        <option value="">All</option>
        {Object.keys(PAY_TONE).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && <Alert>{error}</Alert>}
      {!list.data ? (
        <LoadState status={list.status} error={list.error} reload={list.reload} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No payments yet" />
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.data.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {formatINR(p.amountMinor, true)} · {p.studentName}
                  </span>
                  <span className="block text-muted">
                    <span className="font-mono">{p.reference}</span> · {p.description || "Consultancy service charge"} · {fmtDate(p.createdAt)}
                    {p.receiptNumber && ` · receipt ${p.receiptNumber}`}
                    {p.enquiry && (
                      <>
                        {" · "}
                        <a href={`/admin/enquiries/${p.enquiry}`} className="underline">
                          enquiry
                        </a>
                      </>
                    )}
                  </span>
                </span>
                <Badge tone={PAY_TONE[p.status]}>{p.status}</Badge>
                {["requested", "pending", "failed"].includes(p.status) && (
                  <Button size="sm" variant="ghost" onClick={async () => { setError(""); try { await apiPost(`/admin/payments/${p.id}/cancel`); list.reload(); } catch (e) { setError(errMsg(e)); } }}>
                    Cancel request
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Pager meta={list.data.meta} onPage={(page) => setF({ ...f, page })} />
        </>
      )}
    </div>
  );
}

// Used on an admin enquiry page: ask the student to pay the service charge online.
export function RequestPaymentPanel({ enquiryId, suggestedMinor, onDone }: { enquiryId: string; suggestedMinor: number | null; onDone: () => void }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(suggestedMinor ? String(suggestedMinor / 100) : "");
  const [description, setDescription] = useState("Consultancy service charge");
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (!user?.permissions.includes("payments.manage")) return null;
  const minor = rupeesToPaise(amount);
  return (
    <Card>
      <h2 className="font-semibold">Payment request</h2>
      <p className="mt-1 text-xs text-muted">For EduPath’s own service charge only. Official college fees are paid to the college.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
      </div>
      {flash && (
        <div className="mt-3">
          <Alert tone={flash.tone}>{flash.text}</Alert>
        </div>
      )}
      <Button
        className="mt-3"
        size="sm"
        disabled={!minor || minor < 100}
        onClick={async () => {
          if (!window.confirm(`Ask the student to pay ${formatINR(minor, true)}?`)) return;
          try {
            await apiPost(`/admin/enquiries/${enquiryId}/payments`, { amountMinor: minor, description: description.trim() });
            setFlash({ tone: "success", text: "Request sent; the student was emailed." });
            onDone();
          } catch (e) {
            setFlash({ tone: "error", text: errMsg(e) });
          }
        }}
      >
        Send payment request
      </Button>
    </Card>
  );
}
