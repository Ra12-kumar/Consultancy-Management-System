import { describe, expect, it } from 'vitest';
import { CollegeModel } from '../src/models/College.js';
import { makeCollege, seedPlaces } from './catalogFixtures.js';
import { profile } from './enquiryFixtures.js';
import { registerStudent, useTestDb } from './helpers.js';

useTestDb();

describe('college recommendations', () => {
  it('suggests published colleges matching the preferred course and place, and says why', async () => {
    const p = await seedPlaces();
    await makeCollege({ slug: 'noida-tech', name: 'Noida Tech', location: p.noida._id, course: p.btech._id, tuitionPerYear: 100_000 });
    await makeCollege({ slug: 'chennai-tech', name: 'Chennai Tech', location: p.chennai._id, course: p.btech._id, tuitionPerYear: 100_000 });
    await makeCollege({ slug: 'chennai-mba', name: 'Chennai Business School', location: p.chennai._id, course: p.mba._id, tuitionPerYear: 100_000 });
    await makeCollege({ slug: 'draft-tech', name: 'Draft Tech', status: 'draft', location: p.chennai._id, course: p.btech._id, tuitionPerYear: 100_000 });
    const s = await registerStudent();
    await s.c.put('/api/students/me/profile', { ...profile, preferences: { course: 'B.Tech', location: 'Chennai' } });

    const r = await s.c.get('/api/students/me/recommendations');
    expect(r.status).toBe(200);
    expect(r.body.data.basis).toEqual(['course', 'location']);
    expect(r.body.data.items.map((c: { name: string }) => c.name)).toEqual(['Chennai Tech']);

    // Shortlisted colleges are not suggested again; their coming deadlines are listed instead.
    const chennai = await CollegeModel.findOne({ slug: 'chennai-tech' }).lean();
    await CollegeModel.updateOne({ _id: chennai!._id }, { $set: { admissionDeadline: new Date(Date.now() + 10 * 86_400_000), academicSession: '2026-27' } });
    expect((await s.c.post('/api/students/me/shortlist', { collegeId: String(chennai!._id) })).status).toBeLessThan(300);
    const again = (await s.c.get('/api/students/me/recommendations')).body.data;
    expect(again.items.map((c: { name: string }) => c.name)).not.toContain('Chennai Tech');
    expect(again.deadlines).toEqual([expect.objectContaining({ name: 'Chennai Tech', slug: 'chennai-tech', academicSession: '2026-27' })]);
  });

  it('falls back to featured colleges when the student has no preferences', async () => {
    const p = await seedPlaces();
    const { college } = await makeCollege({ slug: 'star', name: 'Star College', location: p.noida._id, course: p.btech._id, tuitionPerYear: 100_000 });
    await CollegeModel.updateOne({ _id: college._id }, { $set: { featured: true, featuredRank: 1 } });
    const s = await registerStudent();
    const r = (await s.c.get('/api/students/me/recommendations')).body.data;
    expect(r).toMatchObject({ basis: ['featured'], deadlines: [] });
    expect(r.items.map((c: { name: string }) => c.name)).toEqual(['Star College']);
  });
});
