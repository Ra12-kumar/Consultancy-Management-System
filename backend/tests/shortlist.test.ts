import { describe, expect, it } from 'vitest';
import { CollegeModel } from '../src/models/College.js';
import { makeCollege, seedPlaces } from './catalogFixtures.js';
import { createAdmin, registerStudent, useTestDb } from './helpers.js';

useTestDb();

describe('student shortlist and saved comparisons', () => {
  it('saves published colleges privately; another student cannot see or delete them', async () => {
    const p = await seedPlaces();
    const { college: a } = await makeCollege({ slug: 'alpha', location: p.noida._id, course: p.btech._id, tuitionPerYear: 100_000 });
    const { college: b } = await makeCollege({ slug: 'beta', location: p.chennai._id, course: p.btech._id });
    const { college: draft } = await makeCollege({ slug: 'draft', status: 'draft', location: p.chennai._id, course: p.btech._id });
    const priya = await registerStudent();
    const arjun = await registerStudent({ name: 'Arjun Mehta' });

    expect((await priya.c.post('/api/students/me/shortlist', { collegeId: String(a._id), note: 'Top choice' })).status).toBe(201);
    // Saving twice is harmless; drafts and unknown colleges cannot be saved.
    expect((await priya.c.post('/api/students/me/shortlist', { collegeId: String(a._id) })).status).toBe(201);
    expect((await priya.c.post('/api/students/me/shortlist', { collegeId: String(draft._id) })).status).toBe(404);
    // The student id always comes from the session.
    expect((await priya.c.post('/api/students/me/shortlist', { collegeId: String(b._id), student: arjun.id })).status).toBe(422);

    const mine = await priya.c.get('/api/students/me/shortlist');
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].college).toMatchObject({ slug: 'alpha', available: true });
    expect((await arjun.c.get('/api/students/me/shortlist')).body.data).toEqual([]);
    expect((await arjun.c.del(`/api/students/me/shortlist/${a._id}`)).status).toBe(404);

    // A college unpublished after saving shows as unavailable, without its details.
    await CollegeModel.updateOne({ _id: a._id }, { $set: { status: 'archived' } });
    expect((await priya.c.get('/api/students/me/shortlist')).body.data[0].college).toEqual({ id: String(a._id), name: 'alpha', available: false });
    expect((await priya.c.del(`/api/students/me/shortlist/${a._id}`)).status).toBe(200);
  });

  it('saves comparisons of 2-4 published colleges; only the owner can list or delete them', async () => {
    const p = await seedPlaces();
    const { college: a } = await makeCollege({ slug: 'alpha', location: p.noida._id, course: p.btech._id });
    const { college: b } = await makeCollege({ slug: 'beta', location: p.chennai._id, course: p.btech._id });
    const priya = await registerStudent();
    const arjun = await registerStudent({ name: 'Arjun Mehta' });

    expect((await priya.c.post('/api/students/me/comparisons', { name: 'One', colleges: [String(a._id)] })).status).toBe(422);
    expect((await priya.c.post('/api/students/me/comparisons', { name: 'Dup', colleges: [String(a._id), String(a._id)] })).status).toBe(422);
    const saved = await priya.c.post('/api/students/me/comparisons', { name: 'Engineering', colleges: [String(a._id), String(b._id)], course: String(p.btech._id) });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);

    const list = (await priya.c.get('/api/students/me/comparisons')).body.data;
    expect(list[0]).toMatchObject({ name: 'Engineering', course: { slug: 'btech-be' } });
    expect(list[0].colleges.map((c: { slug: string }) => c.slug)).toEqual(['alpha', 'beta']);
    expect((await arjun.c.get('/api/students/me/comparisons')).body.data).toEqual([]);
    expect((await arjun.c.del(`/api/students/me/comparisons/${saved.body.data.id}`)).status).toBe(404);
    expect((await priya.c.del(`/api/students/me/comparisons/${saved.body.data.id}`)).status).toBe(200);
  });

  it('is for students only (admins are refused; admins still read student records)', async () => {
    const s = await registerStudent();
    const { c } = await createAdmin();
    expect((await c.get('/api/students/me/shortlist')).status).toBe(403);
    expect((await c.get(`/api/students/${s.id}`)).status).toBe(200);
  });
});
