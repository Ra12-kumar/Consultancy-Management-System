import mongoose from 'mongoose';
import { StudentProfileModel } from '../models/StudentProfile.js';
import { UserModel, toPublicUser } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import type { ProfileInput } from '../validators/student.validators.js';

// Every function filters by the student's own id (from the session), so one student can never reach
// another student's records, whatever ids a request contains.

// Normalised percentage from the score the student entered (server-side; never taken from the client).
export function normalisedPercentage(score: ProfileInput['academic']['score']): number | null {
  if (!score) return null;
  if (score.type === 'percentage') return Math.round(score.value * 100) / 100;
  if (!score.max) return null;
  // CGPA -> percentage as a proportional share of the scale (institutions may use other formulas).
  return Math.round((score.value / score.max) * 10_000) / 100;
}

const COMPLETION_FIELDS: Array<(p: ProfileInput) => unknown> = [
  (p) => p.personal.city,
  (p) => p.personal.state,
  (p) => p.academic.highestQualification,
  (p) => p.academic.course,
  (p) => p.academic.institution,
  (p) => p.academic.boardOrUniversity,
  (p) => p.academic.passingYear,
  (p) => p.academic.score,
];

function toProfile(doc: { personal?: unknown; academic?: unknown; updatedAt?: Date } | null) {
  const profile = (doc ?? { personal: {}, academic: {} }) as { personal?: Partial<ProfileInput['personal']>; academic?: Partial<ProfileInput['academic']> & { percentage?: number | null }; updatedAt?: Date };
  const p: ProfileInput = {
    personal: { city: '', state: '', guardianName: '', guardianPhone: '', preferredContact: 'email', ...profile.personal },
    academic: { highestQualification: null, course: '', institution: '', boardOrUniversity: '', passingYear: null, score: null, entranceExams: [], ...profile.academic },
  };
  if (p.academic.score && p.academic.score.type == null) p.academic.score = null;
  const done = COMPLETION_FIELDS.filter((f) => {
    const v = f(p);
    return v !== null && v !== '' && v !== undefined;
  }).length;
  return {
    personal: p.personal,
    academic: { ...p.academic, entranceExams: p.academic.entranceExams.map(({ name, score, year }) => ({ name, score, year })), percentage: profile.academic?.percentage ?? null },
    completion: Math.round((done / COMPLETION_FIELDS.length) * 100),
    updatedAt: profile.updatedAt ?? null,
  };
}

export async function getMe(userId: string) {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw ApiError.notFound('Account not found');
  return toPublicUser(user);
}

export async function updateMe(userId: string, changes: { name?: string; mobile?: string }) {
  const user = await UserModel.findOneAndUpdate({ _id: userId, role: 'student' }, { $set: changes }, { new: true, runValidators: true }).lean();
  if (!user) throw ApiError.notFound('Account not found');
  return toPublicUser(user);
}

export async function getProfile(userId: string) {
  return toProfile(await StudentProfileModel.findOne({ user: userId }).lean());
}

export async function saveProfile(userId: string, input: ProfileInput) {
  const doc = await StudentProfileModel.findOneAndUpdate(
    { user: userId },
    { $set: { personal: input.personal, academic: { ...input.academic, percentage: normalisedPercentage(input.academic.score) } } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return toProfile(doc);
}

// A student record for an authorised viewer: the student themself, or an admin with students.read.
export async function getStudent(id: string, viewer: { id: string; role: string; permissions: string[] }) {
  const isSelf = viewer.id === id;
  if (!isSelf && !(viewer.role === 'admin' && viewer.permissions.includes('students.read'))) throw ApiError.notFound('Student not found');
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Student not found');
  const user = await UserModel.findOne({ _id: id, role: 'student' }).lean();
  if (!user) throw ApiError.notFound('Student not found');
  return { ...toPublicUser(user), profile: await getProfile(id) };
}
