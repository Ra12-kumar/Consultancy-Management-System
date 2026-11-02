import { OPTIONAL_FEE_KEYS, type FEE_FREQUENCIES, type FEE_KEYS } from '../models/CollegeFee.js';

export type FeeKey = (typeof FEE_KEYS)[number];
export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];
export type FeeComponent = { key: FeeKey; amountMinor: number; frequency: FeeFrequency };
export type FeeDiscount = { type: 'percent' | 'fixed'; value: number; maxMinor?: number | null; note?: string } | null;
export type FeeInput = { components: FeeComponent[]; durationMonths: number; consultancyServiceChargeMinor?: number; discount?: FeeDiscount };

export const FEE_LABELS: Record<FeeKey, string> = {
  tuition: 'Tuition fee',
  registration: 'Registration fee',
  admission: 'Admission fee',
  examination: 'Examination fee',
  laboratory: 'Laboratory fee',
  other_mandatory: 'Other mandatory fees',
  hostel: 'Hostel (if opted)',
  transport: 'Transport (if opted)',
};

// How many times a component is charged over the whole course. `total_course` and `one_time` are charged once.
export function occurrences(frequency: FeeFrequency, durationMonths: number) {
  if (frequency === 'per_year') return Math.ceil(durationMonths / 12);
  if (frequency === 'per_semester') return Math.ceil(durationMonths / 6);
  return 1;
}

const isMoney = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

// The single source of truth for fee totals (integer paise). Each component counts exactly once per occurrence.
// Official college fees, optional fees (hostel/transport) and the consultancy's charge are kept apart.
export function calculateFee({ components, durationMonths, consultancyServiceChargeMinor = 0, discount = null }: FeeInput) {
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120) throw new RangeError('durationMonths must be 1-120');
  if (!isMoney(consultancyServiceChargeMinor)) throw new RangeError('consultancyServiceChargeMinor must be a non-negative integer');
  const seen = new Set<FeeKey>();
  const lines = components.map((c) => {
    if (!isMoney(c.amountMinor)) throw new RangeError(`${c.key}: amount must be a non-negative integer (paise)`);
    if (seen.has(c.key)) throw new RangeError(`${c.key}: listed more than once`);
    seen.add(c.key);
    const times = occurrences(c.frequency, durationMonths);
    return {
      key: c.key,
      label: FEE_LABELS[c.key],
      group: (OPTIONAL_FEE_KEYS as readonly string[]).includes(c.key) ? ('optional' as const) : ('official' as const),
      frequency: c.frequency,
      amountMinor: c.amountMinor,
      occurrences: times,
      courseTotalMinor: c.amountMinor * times,
    };
  });
  const sum = (group: 'official' | 'optional') => lines.filter((l) => l.group === group).reduce((t, l) => t + l.courseTotalMinor, 0);
  const officialTotalMinor = sum('official');
  const optionalTotalMinor = sum('optional');

  // Discounts apply to tuition only and can never exceed it.
  const tuitionMinor = lines.find((l) => l.key === 'tuition')?.courseTotalMinor ?? 0;
  let discountMinor = 0;
  if (discount) {
    if (discount.type === 'percent') {
      if (!(discount.value >= 0 && discount.value <= 100)) throw new RangeError('A percentage discount must be 0-100');
      discountMinor = Math.round((tuitionMinor * discount.value) / 100);
      if (discount.maxMinor != null) discountMinor = Math.min(discountMinor, discount.maxMinor);
    } else {
      if (!isMoney(discount.value)) throw new RangeError('A fixed discount must be a non-negative integer (paise)');
      discountMinor = discount.value;
    }
    discountMinor = Math.min(discountMinor, tuitionMinor);
  }
  const officialAfterDiscountMinor = officialTotalMinor - discountMinor;

  // Annual figures for "per year" budgets. Only recurring components count (per year, or per semester x 2);
  // one-time and whole-course items are never spread over years. Null when nothing recurring is published, so a
  // college with only a whole-course fee is "not comparable" on an annual basis rather than looking cheap.
  const annualOf = (group: 'official' | 'optional', key?: FeeKey) => {
    const recurring = lines.filter((l) => l.group === group && (!key || l.key === key) && (l.frequency === 'per_year' || l.frequency === 'per_semester'));
    return recurring.length ? recurring.reduce((t, l) => t + l.amountMinor * (l.frequency === 'per_semester' ? 2 : 1), 0) : null;
  };
  const annualOfficialMinor = annualOf('official');
  const hostelAnnualMinor = annualOf('optional', 'hostel');

  return {
    currency: 'INR' as const,
    durationMonths,
    lines,
    officialTotalMinor,
    discountMinor,
    discountNote: discount?.note ?? '',
    officialAfterDiscountMinor,
    optionalTotalMinor,
    consultancyServiceChargeMinor,
    // What the student pays for admission: official fees after discount plus the consultancy charge
    // (shown as its own line). Optional hostel/transport are not included.
    estimatedTotalMinor: officialAfterDiscountMinor + consultancyServiceChargeMinor,
    // Recurring official fees per year (null = not published on an annual basis).
    annualOfficialMinor,
    // Hostel per year, if a recurring hostel fee is published.
    hostelAnnualMinor,
    // Everything over the whole course: official fees after discount, optional fees if opted, and the service charge.
    overallEstimateMinor: officialAfterDiscountMinor + optionalTotalMinor + consultancyServiceChargeMinor,
  };
}

export type FeeBreakdown = ReturnType<typeof calculateFee>;

// The totals stored on a fee document for search (always recomputed by the server from the components).
export const storedTotals = (b: FeeBreakdown) => ({ officialTotalMinor: b.officialTotalMinor, annualOfficialMinor: b.annualOfficialMinor, hostelAnnualMinor: b.hostelAnnualMinor, overallEstimateMinor: b.overallEstimateMinor });
