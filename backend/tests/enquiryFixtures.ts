import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { makeCollege, seedPlaces } from './catalogFixtures.js';
import { createAdmin, registerStudent } from './helpers.js';

export const profile = {
  personal: { city: 'Chennai', state: 'Tamil Nadu', guardianName: '', guardianPhone: '', preferredContact: 'email' },
  academic: { highestQualification: 'class_12', course: 'PCM', institution: 'Govt Hr Sec School', boardOrUniversity: 'TN State Board', passingYear: 2025, score: { type: 'percentage', value: 82, max: 100 }, entranceExams: [] },
};

// A published college with a B.Tech fee, an admin (all permissions) and a verified student with a profile.
export async function enquiryWorld() {
  const p = await seedPlaces();
  const { college } = await makeCollege({ slug: 'alpha', name: 'Alpha Institute', location: p.noida._id, course: p.btech._id, tuitionPerYear: 100_000 });
  const admin = await createAdmin();
  const student = await registerStudent();
  expect((await student.c.put('/api/students/me/profile', profile)).status).toBe(200);
  return { p, college, admin, student };
}

export const enquiryBody = (w: Awaited<ReturnType<typeof enquiryWorld>>, extra: object = {}) => ({
  idempotencyKey: randomUUID(),
  courses: [String(w.p.btech._id)],
  colleges: [String(w.college._id)],
  locations: [String(w.p.ncr._id)],
  budgetMinor: 50_000_000,
  hostel: true,
  admissionYear: new Date().getFullYear(),
  counsellingRequest: 'Please call after 6 pm',
  ...extra,
});

export async function submitEnquiry(w: Awaited<ReturnType<typeof enquiryWorld>>, extra: object = {}) {
  const r = await w.student.c.post('/api/enquiries', enquiryBody(w, extra));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const list = await w.admin.c.get(`/api/admin/enquiries?q=${r.body.data.reference}`);
  return { reference: r.body.data.reference as string, id: list.body.data[0].id as string, res: r };
}
