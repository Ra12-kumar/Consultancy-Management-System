// Course eligibility from a student's marks and qualification against what a college states for a course.
// It never promises admission: the result is "eligible", "potentially_eligible" (data missing, an entrance exam
// is needed, or the marks are just below the cut-off) or "not_eligible", always with the reasons.

export type Eligibility = 'eligible' | 'potentially_eligible' | 'not_eligible';
export type StudentAcademics = {
  highestQualification: string | null;
  // Overall percentage of the highest qualification (from the profile's score).
  percentage: number | null;
  marks: { class10: number | null; class12: number | null; graduation: number | null };
  entranceExams: string[];
};
export type CourseRule = { level: string; minQualification: string | null; minPercentage: number | null; entranceExams: string[] };

const RANK: Record<string, number> = { class_10: 1, class_12: 2, diploma: 2, undergraduate: 3, postgraduate: 4 };
const NEAR_CUTOFF = 5; // percentage points below the cut-off that still deserve a counsellor's look
const LABEL: Record<string, string> = { class_10: 'Class 10', class_12: 'Class 12', diploma: 'Diploma', undergraduate: 'an undergraduate degree', postgraduate: 'a postgraduate degree' };

// The marks a course of this level is usually judged on.
function relevantMarks(level: string, s: StudentAcademics): { value: number | null; basis: string } {
  if (level === 'diploma') return { value: s.marks.class10 ?? (s.highestQualification === 'class_10' ? s.percentage : null), basis: 'Class 10' };
  if (level === 'ug') return { value: s.marks.class12 ?? (s.highestQualification === 'class_12' ? s.percentage : null), basis: 'Class 12' };
  return { value: s.marks.graduation ?? (s.highestQualification === 'undergraduate' ? s.percentage : null), basis: 'graduation' };
}

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');

export function checkEligibility(s: StudentAcademics, rule: CourseRule): { result: Eligibility; reasons: string[] } {
  const reasons: string[] = [];
  let result: Eligibility = 'eligible';
  const lower = (to: Eligibility) => {
    if (result === 'not_eligible') return;
    if (to === 'not_eligible' || result === 'eligible') result = to;
  };

  if (rule.minQualification && RANK[rule.minQualification] !== undefined) {
    const mine = s.highestQualification ? RANK[s.highestQualification] : undefined;
    if (mine === undefined) {
      lower('potentially_eligible');
      reasons.push(`Needs ${LABEL[rule.minQualification]}; your highest qualification is not recorded`);
    } else if (mine < RANK[rule.minQualification]!) {
      lower('not_eligible');
      reasons.push(`Needs ${LABEL[rule.minQualification]}`);
    } else reasons.push(`Qualification meets the minimum (${LABEL[rule.minQualification]})`);
  }

  if (rule.minPercentage != null) {
    const { value, basis } = relevantMarks(rule.level, s);
    if (value == null) {
      lower('potentially_eligible');
      reasons.push(`Needs at least ${rule.minPercentage}% in ${basis}; your ${basis} marks are not recorded`);
    } else if (value >= rule.minPercentage) reasons.push(`${basis} marks ${value}% meet the minimum ${rule.minPercentage}%`);
    else if (value >= rule.minPercentage - NEAR_CUTOFF) {
      lower('potentially_eligible');
      reasons.push(`${basis} marks ${value}% are just below the minimum ${rule.minPercentage}% (relaxations may apply)`);
    } else {
      lower('not_eligible');
      reasons.push(`${basis} marks ${value}% are below the minimum ${rule.minPercentage}%`);
    }
  }

  if (rule.entranceExams.length) {
    const taken = new Set(s.entranceExams.map(norm));
    const match = rule.entranceExams.find((e) => taken.has(norm(e)));
    if (match) reasons.push(`Has taken ${match}`);
    else {
      lower('potentially_eligible');
      reasons.push(`Needs an entrance exam: ${rule.entranceExams.join(' or ')}`);
    }
  }

  if (!reasons.length) reasons.push('The college lists no minimum marks or exam for this course; confirm with the college');
  return { result, reasons };
}
