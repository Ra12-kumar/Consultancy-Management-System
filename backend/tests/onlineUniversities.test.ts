import type { Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { CollegeModel } from '../src/models/College.js';
import { CollegeCourseModel } from '../src/models/CollegeCourse.js';
import { LocationModel } from '../src/models/Location.js';
import data from '../../database/data/online-universities.json' with { type: 'json' };
import { importOnlineUniversities, parseProgramme, type Checker, type OnlineUniversitiesFile } from '../../database/scripts/online-universities.lib.js';
import { app, createAdmin, useTestDb } from './helpers.js';

useTestDb();

const file = data as OnlineUniversitiesFile;
const pick = (...keys: string[]): OnlineUniversitiesFile => ({ ...file, universities: file.universities.filter((u) => keys.includes(u.key)) });
// No network in tests: every address answers, except the ones listed as failing.
const fakeCheck = (failing: string[] = []): Checker => async (url, expect) =>
  failing.includes(url)
    ? { ok: false, status: 404, finalUrl: url, contentType: 'text/html', reason: 'HTTP 404' }
    : { ok: true, status: 200, finalUrl: url, contentType: expect === 'image' ? 'image/png' : 'text/html', reason: 'ok' };
async function adminReq() {
  const { id, email } = await createAdmin();
  return { user: { id, role: 'admin', name: 'Asha Admin', email }, ip: '', id: 'test' } as unknown as Request;
}

describe('UGC-DEB programme names', () => {
  it('maps names to catalogue courses, levels, specializations and durations', () => {
    expect(parseProgramme('MASTER OF BUSINESS ADMINISTRATION (WORKING EXECUTIVE)')).toMatchObject({ course: 'mba-pgdm', specialization: 'Working Executive', level: 'pg', durationMonths: 24 });
    expect(parseProgramme('BACHELOR OF COMMERCE (HONS.) - 4 Years')).toMatchObject({ course: 'bcom', specialization: 'Honours', durationMonths: 48 });
    expect(parseProgramme('BACHELOR OF ARTS (HONS.) (POLITICAL SCIENCE)')).toMatchObject({ course: 'ba', specialization: 'Political Science (Honours)' });
    expect(parseProgramme('BACHELOR OF BUSINESS ADMINISTRATION (GENERAL)')).toMatchObject({ course: 'bba', specialization: '' });
    expect(parseProgramme('B.A (ENGLISH, HISTORY, POLITICAL SCIENCE, ECONOMICS AND SOCIOLOGY)')).toMatchObject({ course: 'ba', specialization: 'English, History, Political Science, Economics and Sociology' });
    expect(parseProgramme('POST GRADUATE DIPLOMA-DATA SCIENCE')).toMatchObject({ course: 'pg-diploma', specialization: 'Data Science', level: 'pg_diploma', durationMonths: 12 });
    expect(parseProgramme('MASTER OF ARTS PUBLIC POLICY & GOVERNANCE')).toMatchObject({ course: 'ma', specialization: 'Public Policy & Governance' });
    expect(parseProgramme('BACHELOR OF ARTS (POLITICAL SCIENCE,ECONOMICS,ENGLISH,SOCIOLOGY)')!.specialization).toBe('Political Science, Economics, English, Sociology');
    // The level follows the degree name, not a wrong UG/PG column.
    expect(parseProgramme('BACHELOR OF COMPUTER APPLICATIONS')).toMatchObject({ course: 'bca', level: 'ug' });
    expect(parseProgramme('DIPLOMA IN YOGA')).toBeNull();
    // Every programme in the data file maps to a course, within the catalogue's 120-character limit.
    for (const u of file.universities) for (const p of u.programmes) expect(parseProgramme(p.name)?.specialization.length ?? 999, p.name).toBeLessThanOrEqual(120);
  });

  it('lists all 23 universities with official https sources and no Galgotias entry', () => {
    expect(file.universities).toHaveLength(23);
    expect(new Set(file.universities.map((u) => u.slug)).size).toBe(23);
    for (const u of file.universities) {
      expect(u.website, u.key).toMatch(/^https:\/\//);
      expect(u.logoUrl, u.key).toMatch(/^https:\/\//);
    }
    expect(file.universities.some((u) => /galgotia/i.test(u.name))).toBe(false);
  });
});

describe('importing the Online UG & PG universities', () => {
  it('publishes verified records with online courses, adds missing places and courses, and never duplicates', async () => {
    const req = await adminReq();
    const subset = pick('amity', 'jindal', 'upes');
    const first = await importOnlineUniversities(subset, { req, check: fakeCheck(), apply: true });
    expect(first).toHaveLength(3);
    expect(first.every((r) => r.action === 'created' && r.published)).toBe(true);
    expect(await LocationModel.exists({ slug: 'dehradun', kind: 'city' })).toBeTruthy();

    // Public API: published, with the official website and logo, and online courses only from UGC-DEB.
    const res = await request(app).get('/api/colleges/amity-university-noida');
    expect(res.status).toBe(200);
    const college = res.body.data;
    expect(college).toMatchObject({ name: 'Amity University, Noida', city: 'Noida', state: 'Uttar Pradesh', website: 'https://www.amity.edu/', logoUrl: 'https://www.amity.edu/images/logo-amity.png' });
    expect(college.about).toContain('UGC-DEB lists 18 programmes');
    expect(college.offerings).toHaveLength(18);
    expect(college.offerings.every((o: { mode: string }) => o.mode === 'online')).toBe(true);
    expect((await CollegeModel.findOne({ slug: 'amity-university-noida' }).lean())!.verificationSource).toContain('deb.ugc.ac.in');

    // Not in the current online list: published without courses, and the description says so.
    const jgu = (await request(app).get('/api/colleges/op-jindal-global-university')).body.data;
    expect(jgu.offerings).toHaveLength(0);
    expect(jgu.about).toContain('last listed online entitlement was for 2022-23');

    // Running again updates in place.
    const again = await importOnlineUniversities(subset, { req, check: fakeCheck(), apply: true });
    expect(again.every((r) => r.action === 'updated')).toBe(true);
    expect(await CollegeModel.countDocuments()).toBe(3);
    expect(await CollegeCourseModel.countDocuments({ college: college.id })).toBe(18);
    expect(await AuditLogModel.countDocuments({ action: 'catalog.college_created' })).toBe(3);
  });

  it('updates an existing record with the same name and state instead of adding a second one', async () => {
    const req = await adminReq();
    await importOnlineUniversities(pick('lpu'), { req, check: fakeCheck(), apply: false });
    expect(await CollegeModel.countDocuments()).toBe(0);
    // An admin had already added LPU by hand under another slug.
    const lpu = pick('lpu').universities[0]!;
    await importOnlineUniversities({ ...pick('lpu'), universities: [{ ...lpu, slug: 'lpu-by-hand', programmes: [] }] }, { req, check: fakeCheck(), apply: true });
    const [r] = await importOnlineUniversities(pick('lpu'), { req, check: fakeCheck(), apply: true });
    expect(r?.action).toBe('updated');
    expect(await CollegeModel.countDocuments({ name: 'Lovely Professional University' })).toBe(1);
  });

  it('skips a university whose official website does not open and leaves out a logo that is not an image', async () => {
    const req = await adminReq();
    const two = pick('gla', 'smu');
    const gla = two.universities.find((u) => u.key === 'gla')!;
    const smu = two.universities.find((u) => u.key === 'smu')!;
    const reports = await importOnlineUniversities(two, { req, check: fakeCheck([gla.website, smu.logoUrl]), apply: true });
    expect(reports.find((r) => r.key === 'gla')).toMatchObject({ action: 'skipped', published: false });
    expect(await CollegeModel.exists({ slug: gla.slug })).toBeNull();
    const s = await CollegeModel.findOne({ slug: smu.slug }).lean();
    expect(s).toMatchObject({ status: 'published', logoUrl: '' });
  });
});
