"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Alert, Card, ProgressSteps, Skeleton } from "@/components/ui/Feedback";
import { useAuth } from "@/features/auth/AuthProvider";
import { useApiData } from "@/hooks/useApiData";
import { mobileProblem, nameProblem } from "@/lib/validation";
import { apiGet, apiPatch, apiPut, fieldErrors } from "@/services/api";
import type { ApiError, Profile, User } from "@/types/api";

const STEPS = ["Personal", "Academic", "Review"];
const QUALIFICATIONS = [
  ["class_10", "Class 10"],
  ["class_12", "Class 12"],
  ["diploma", "Diploma"],
  ["undergraduate", "Undergraduate degree"],
  ["postgraduate", "Postgraduate degree"],
  ["other", "Other"],
] as const;

type Draft = {
  name: string;
  mobile: string;
  city: string;
  state: string;
  guardianName: string;
  guardianPhone: string;
  preferredContact: "email" | "phone" | "whatsapp";
  highestQualification: string;
  course: string;
  institution: string;
  boardOrUniversity: string;
  passingYear: string;
  scoreType: "" | "percentage" | "cgpa" | "marks";
  scoreValue: string;
  scoreMax: string;
  examName: string;
  examScore: string;
  examYear: string;
  prefCourse: string;
  prefLocation: string;
  m10: string;
  m10Board: string;
  m10Year: string;
  m12: string;
  m12Board: string;
  m12Year: string;
  m12Stream: string;
  mGrad: string;
  mGradDegree: string;
  mGradYear: string;
};

function draftFrom(user: User, p: Profile): Draft {
  const exam = p.academic.entranceExams[0];
  return {
    name: user.name,
    mobile: user.mobile ?? "",
    ...p.personal,
    highestQualification: p.academic.highestQualification ?? "",
    course: p.academic.course,
    institution: p.academic.institution,
    boardOrUniversity: p.academic.boardOrUniversity,
    passingYear: p.academic.passingYear ? String(p.academic.passingYear) : "",
    scoreType: p.academic.score?.type ?? "",
    scoreValue: p.academic.score ? String(p.academic.score.value) : "",
    scoreMax: p.academic.score?.max ? String(p.academic.score.max) : "",
    examName: exam?.name ?? "",
    examScore: exam?.score ?? "",
    examYear: exam?.year ? String(exam.year) : "",
    prefCourse: p.preferences?.course ?? "",
    prefLocation: p.preferences?.location ?? "",
    m10: p.marks?.class10.percentage != null ? String(p.marks.class10.percentage) : "",
    m10Board: p.marks?.class10.board ?? "",
    m10Year: p.marks?.class10.year ? String(p.marks.class10.year) : "",
    m12: p.marks?.class12.percentage != null ? String(p.marks.class12.percentage) : "",
    m12Board: p.marks?.class12.board ?? "",
    m12Year: p.marks?.class12.year ? String(p.marks.class12.year) : "",
    m12Stream: p.marks?.class12.stream ?? "",
    mGrad: p.marks?.graduation.percentage != null ? String(p.marks.graduation.percentage) : "",
    mGradDegree: p.marks?.graduation.degree ?? "",
    mGradYear: p.marks?.graduation.year ? String(p.marks.graduation.year) : "",
  };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

function Editor({ user, profile, onSaved }: { user: User; profile: Profile; onSaved: (p: Profile, u: User) => void }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => draftFrom(user, profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ busy: boolean; ok?: string; error?: string }>({ busy: false });
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value }));

  function checkPersonal() {
    const e: Record<string, string> = {};
    const n = nameProblem(d.name);
    if (n) e.name = n;
    const m = mobileProblem(d.mobile);
    if (m) e.mobile = m;
    if (d.guardianPhone && mobileProblem(d.guardianPhone)) e["personal.guardianPhone"] = "Enter a valid phone number";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    setErrors({});
    try {
      const u = await apiPatch<User>("/students/me", { name: d.name.trim(), mobile: d.mobile.trim() });
      const p = await apiPut<Profile>("/students/me/profile", {
        personal: { city: d.city.trim(), state: d.state.trim(), guardianName: d.guardianName.trim(), guardianPhone: d.guardianPhone.trim(), preferredContact: d.preferredContact },
        academic: {
          highestQualification: d.highestQualification || null,
          course: d.course.trim(),
          institution: d.institution.trim(),
          boardOrUniversity: d.boardOrUniversity.trim(),
          passingYear: num(d.passingYear),
          score: d.scoreType && d.scoreValue ? { type: d.scoreType, value: Number(d.scoreValue), max: d.scoreType === "percentage" ? null : num(d.scoreMax) } : null,
          entranceExams: d.examName.trim() ? [{ name: d.examName.trim(), score: d.examScore.trim(), year: num(d.examYear) }] : [],
        },
        preferences: { course: d.prefCourse.trim(), location: d.prefLocation.trim() },
        marks: {
          class10: { percentage: num(d.m10), board: d.m10Board.trim(), year: num(d.m10Year) },
          class12: { percentage: num(d.m12), board: d.m12Board.trim(), year: num(d.m12Year), stream: d.m12Stream.trim() },
          graduation: { percentage: num(d.mGrad), degree: d.mGradDegree.trim(), year: num(d.mGradYear) },
        },
      });
      onSaved(p, u);
      setState({ busy: false, ok: "Your profile has been saved." });
    } catch (err) {
      const f = fieldErrors(err);
      setErrors(f);
      setState({ busy: false, error: Object.keys(f).length ? "Please check the highlighted fields." : (err as ApiError).message });
      if (Object.keys(f).some((k) => k.startsWith("academic") || k.startsWith("marks"))) setStep(1);
      else if (Object.keys(f).length) setStep(0);
    }
  }

  return (
    <Card>
      <ProgressSteps steps={STEPS} current={step} />
      <form onSubmit={save} className="mt-6 space-y-5" noValidate>
        {step === 0 && (
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-lg font-semibold">Personal details</legend>
            <TextField label="Full name" required value={d.name} onChange={set("name")} error={errors.name} />
            <TextField label="Mobile number" type="tel" required value={d.mobile} onChange={set("mobile")} error={errors.mobile} hint="Indian numbers can be entered without +91" />
            <TextField label="City" value={d.city} onChange={set("city")} error={errors["personal.city"]} />
            <TextField label="State" value={d.state} onChange={set("state")} error={errors["personal.state"]} />
            <TextField label="Parent / guardian name (optional)" value={d.guardianName} onChange={set("guardianName")} />
            <TextField label="Parent / guardian phone (optional)" type="tel" value={d.guardianPhone} onChange={set("guardianPhone")} error={errors["personal.guardianPhone"]} />
            <SelectField label="Preferred contact method" value={d.preferredContact} onChange={set("preferredContact")}>
              <option value="email">Email</option>
              <option value="phone">Phone call</option>
              <option value="whatsapp">WhatsApp</option>
            </SelectField>
          </fieldset>
        )}
        {step === 1 && (
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-lg font-semibold">Academic details</legend>
            <SelectField label="Highest completed qualification" value={d.highestQualification} onChange={set("highestQualification")}>
              <option value="">Select…</option>
              {QUALIFICATIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectField>
            <TextField label="Course / stream" placeholder="e.g. PCM, B.Com" value={d.course} onChange={set("course")} />
            <TextField label="School or college" value={d.institution} onChange={set("institution")} />
            <TextField label="Board or university" value={d.boardOrUniversity} onChange={set("boardOrUniversity")} />
            <TextField label="Passing year" type="number" inputMode="numeric" value={d.passingYear} onChange={set("passingYear")} error={errors["academic.passingYear"]} />
            <SelectField label="Result type" value={d.scoreType} onChange={set("scoreType")}>
              <option value="">Select…</option>
              <option value="percentage">Percentage</option>
              <option value="cgpa">CGPA</option>
              <option value="marks">Marks</option>
            </SelectField>
            {d.scoreType && (
              <>
                <TextField label={d.scoreType === "percentage" ? "Percentage" : d.scoreType === "cgpa" ? "CGPA" : "Marks obtained"} type="number" inputMode="decimal" step="0.01" value={d.scoreValue} onChange={set("scoreValue")} error={errors["academic.score.value"]} />
                {d.scoreType === "cgpa" && (
                  <SelectField label="CGPA scale" value={d.scoreMax} onChange={set("scoreMax")} error={errors["academic.score.max"]}>
                    <option value="">Select…</option>
                    <option value="10">Out of 10</option>
                    <option value="5">Out of 5</option>
                    <option value="4">Out of 4</option>
                  </SelectField>
                )}
                {d.scoreType === "marks" && <TextField label="Maximum marks" type="number" inputMode="numeric" value={d.scoreMax} onChange={set("scoreMax")} error={errors["academic.score.max"]} />}
              </>
            )}
            <TextField label="Entrance exam (optional)" placeholder="e.g. JEE Main, NEET, CUET" value={d.examName} onChange={set("examName")} error={errors["academic.entranceExams.0.name"]} />
            <TextField label="Exam score / rank (optional)" value={d.examScore} onChange={set("examScore")} />
            <TextField label="Course you want to study (optional)" placeholder="e.g. B.Tech, MBA" value={d.prefCourse} onChange={set("prefCourse")} maxLength={120} hint="Used to suggest colleges" />
            <TextField label="Preferred study location (optional)" placeholder="e.g. Bengaluru, Delhi NCR" value={d.prefLocation} onChange={set("prefLocation")} maxLength={120} />
            <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:col-span-2 sm:grid-cols-3">
              <legend className="px-1 text-sm font-semibold">Marks (percentage; optional, used to check course eligibility)</legend>
              <TextField label="Class 10 %" type="number" inputMode="decimal" step="0.01" min={0} max={100} value={d.m10} onChange={set("m10")} error={errors["marks.class10.percentage"]} />
              <TextField label="Class 10 board" value={d.m10Board} onChange={set("m10Board")} maxLength={120} />
              <TextField label="Class 10 year" type="number" inputMode="numeric" value={d.m10Year} onChange={set("m10Year")} error={errors["marks.class10.year"]} />
              <TextField label="Class 12 %" type="number" inputMode="decimal" step="0.01" min={0} max={100} value={d.m12} onChange={set("m12")} error={errors["marks.class12.percentage"]} />
              <TextField label="Class 12 board" value={d.m12Board} onChange={set("m12Board")} maxLength={120} />
              <TextField label="Class 12 stream" placeholder="e.g. PCM, Commerce" value={d.m12Stream} onChange={set("m12Stream")} maxLength={60} />
              <TextField label="Graduation %" type="number" inputMode="decimal" step="0.01" min={0} max={100} value={d.mGrad} onChange={set("mGrad")} error={errors["marks.graduation.percentage"]} />
              <TextField label="Graduation degree" placeholder="e.g. B.Com" value={d.mGradDegree} onChange={set("mGradDegree")} maxLength={120} />
              <TextField label="Graduation year" type="number" inputMode="numeric" value={d.mGradYear} onChange={set("mGradYear")} error={errors["marks.graduation.year"]} />
            </fieldset>
          </fieldset>
        )}
        {step === 2 && (
          <div className="space-y-3 text-sm">
            <h2 className="text-lg font-semibold">Review</h2>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {[
                ["Name", d.name],
                ["Mobile", d.mobile],
                ["Location", [d.city, d.state].filter(Boolean).join(", ") || "—"],
                ["Qualification", QUALIFICATIONS.find(([v]) => v === d.highestQualification)?.[1] ?? "—"],
                ["Course", d.course || "—"],
                ["Institution", d.institution || "—"],
                ["Result", d.scoreType && d.scoreValue ? `${d.scoreValue}${d.scoreType === "percentage" ? "%" : d.scoreMax ? ` / ${d.scoreMax}` : ""}` : "—"],
                ["Entrance exam", d.examName ? `${d.examName} ${d.examScore}`.trim() : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted">Your percentage is calculated by our server from the result you enter.</p>
          </div>
        )}
        {state.ok && <Alert tone="success">{state.ok}</Alert>}
        {state.error && <Alert>{state.error}</Alert>}
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </Button>
          {step < 2 ? (
            // Separate keys: reusing one <button> would turn the Continue click into a submit on the last step.
            <Button key="continue" onClick={() => (step === 0 ? checkPersonal() && setStep(1) : setStep(2))}>
              Continue
            </Button>
          ) : (
            <Button key="submit" type="submit" variant="gold" disabled={state.busy}>
              {state.busy ? "Saving…" : "Save profile"}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

export default function ProfileForm() {
  const { user, setUser } = useAuth();
  const profile = useApiData((signal) => apiGet<Profile>("/students/me/profile", { signal }), []);
  const [saved, setSaved] = useState<Profile | null>(null);
  if (!user || (!profile.data && profile.status === "loading")) return <Skeleton className="h-96" />;
  if (profile.status === "error") return <Alert>{profile.error?.message}</Alert>;
  const p = saved ?? profile.data!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
          <p className="text-sm text-muted">{p.completion}% complete{p.academic.percentage != null && ` · Calculated result: ${p.academic.percentage}%`}</p>
        </div>
      </div>
      <Editor
        user={user}
        profile={p}
        onSaved={(np, u) => {
          setSaved(np);
          setUser(u);
        }}
      />
    </div>
  );
}
