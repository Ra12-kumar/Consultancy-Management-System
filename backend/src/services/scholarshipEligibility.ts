// Preliminary scholarship eligibility (pure and unit-tested). It never decides an award: unknown facts give
// "needs review", and every result is labelled preliminary in the UI until an admin decides.

export type Rules = {
  courses: string[];
  minPercentage: number | null;
  maxFamilyIncomeMinor: number | null;
  states: string[];
  categories: string[];
  genders: string[];
};
export type Facts = {
  courses: string[]; // courses the student is interested in (from the application or their enquiries)
  percentage: number | null;
  familyIncomeMinor: number | null;
  state: string | null; // Location id of the student's state
  category: string | null;
  gender: string | null;
};
export type Reason = { rule: string; ok: boolean | null; message: string };
export type Eligibility = { result: 'likely_eligible' | 'not_eligible' | 'needs_review'; reasons: Reason[] };

const rupees = (minor: number) => `₹${new Intl.NumberFormat('en-IN').format(Math.round(minor / 100))}`;

export function checkEligibility(rules: Rules, facts: Facts, opts: { deadline?: Date | null; now?: Date; labels?: Record<string, string> } = {}): Eligibility {
  const reasons: Reason[] = [];
  const name = (id: string) => opts.labels?.[id] ?? id;
  const add = (rule: string, ok: boolean | null, message: string) => reasons.push({ rule, ok, message });

  if (opts.deadline && opts.deadline.getTime() < (opts.now ?? new Date()).getTime()) add('deadline', false, 'The application deadline has passed');

  if (rules.courses.length) {
    if (!facts.courses.length) add('course', null, `For ${rules.courses.map(name).join(', ')} – tell us your course`);
    else if (facts.courses.some((c) => rules.courses.includes(c))) add('course', true, 'Your course is covered');
    else add('course', false, `Only for ${rules.courses.map(name).join(', ')}`);
  }
  if (rules.minPercentage != null) {
    if (facts.percentage == null) add('percentage', null, `Needs at least ${rules.minPercentage}% – add your marks to your profile`);
    else if (facts.percentage >= rules.minPercentage) add('percentage', true, `Your ${facts.percentage}% meets the ${rules.minPercentage}% minimum`);
    else add('percentage', false, `Needs at least ${rules.minPercentage}% (you have ${facts.percentage}%)`);
  }
  if (rules.maxFamilyIncomeMinor != null) {
    if (facts.familyIncomeMinor == null) add('income', null, `Family income must be up to ${rupees(rules.maxFamilyIncomeMinor)} a year – tell us yours`);
    else if (facts.familyIncomeMinor <= rules.maxFamilyIncomeMinor) add('income', true, `Family income is within the ${rupees(rules.maxFamilyIncomeMinor)} limit`);
    else add('income', false, `Family income must be up to ${rupees(rules.maxFamilyIncomeMinor)} a year`);
  }
  if (rules.states.length) {
    if (!facts.state) add('state', null, `For students from ${rules.states.map(name).join(', ')} – add your state to your profile`);
    else if (rules.states.includes(facts.state)) add('state', true, 'Your state is covered');
    else add('state', false, `Only for students from ${rules.states.map(name).join(', ')}`);
  }
  if (rules.categories.length) {
    if (!facts.category) add('category', null, `For ${rules.categories.map((c) => c.toUpperCase()).join(', ')} categories – tell us yours`);
    else if (rules.categories.includes(facts.category)) add('category', true, 'Your category is covered');
    else add('category', false, `Only for ${rules.categories.map((c) => c.toUpperCase()).join(', ')} categories`);
  }
  if (rules.genders.length) {
    if (!facts.gender) add('gender', null, `For ${rules.genders.join(', ')} students – tell us yours`);
    else if (rules.genders.includes(facts.gender)) add('gender', true, 'Matches the eligible gender');
    else add('gender', false, `Only for ${rules.genders.join(', ')} students`);
  }

  const result = reasons.some((r) => r.ok === false) ? 'not_eligible' : reasons.some((r) => r.ok === null) ? 'needs_review' : 'likely_eligible';
  if (!reasons.length) add('open', true, 'No specific criteria listed');
  return { result, reasons };
}
