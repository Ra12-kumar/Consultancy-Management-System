import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { CollegeFeeModel } from '../src/models/CollegeFee.js';
import { calculateFee, occurrences } from '../src/services/feeCalculator.js';
import { makeCollege, rupees, seedPlaces } from './catalogFixtures.js';
import { app, createAdmin, createLimitedAdmin, useTestDb } from './helpers.js';

describe('fee calculator', () => {
  it('counts each component once per occurrence over the course', () => {
    expect(occurrences('per_year', 48)).toBe(4);
    expect(occurrences('per_semester', 48)).toBe(8);
    expect(occurrences('per_year', 30)).toBe(3);
    expect(occurrences('one_time', 48)).toBe(1);
    expect(occurrences('total_course', 48)).toBe(1);

    const b = calculateFee({
      durationMonths: 48,
      components: [
        { key: 'tuition', amountMinor: rupees(100_000), frequency: 'per_year' },
        { key: 'registration', amountMinor: rupees(5_000), frequency: 'one_time' },
        { key: 'examination', amountMinor: rupees(2_000), frequency: 'per_semester' },
        // A whole-course amount is never multiplied.
        { key: 'laboratory', amountMinor: rupees(20_000), frequency: 'total_course' },
        { key: 'hostel', amountMinor: rupees(80_000), frequency: 'per_year' },
      ],
      consultancyServiceChargeMinor: rupees(10_000),
    });
    expect(b.officialTotalMinor).toBe(rupees(400_000 + 5_000 + 16_000 + 20_000));
    // Optional fees and the consultancy charge are kept apart from official fees.
    expect(b.optionalTotalMinor).toBe(rupees(320_000));
    expect(b.consultancyServiceChargeMinor).toBe(rupees(10_000));
    expect(b.estimatedTotalMinor).toBe(b.officialTotalMinor + rupees(10_000));
    expect(b.lines.find((l) => l.key === 'hostel')!.group).toBe('optional');
  });

  it('applies a percentage discount to tuition only, capped, and never beyond tuition', () => {
    const components = [
      { key: 'tuition' as const, amountMinor: rupees(100_000), frequency: 'per_year' as const },
      { key: 'admission' as const, amountMinor: rupees(50_000), frequency: 'one_time' as const },
    ];
    expect(calculateFee({ durationMonths: 24, components, discount: { type: 'percent', value: 10 } }).discountMinor).toBe(rupees(20_000));
    expect(calculateFee({ durationMonths: 24, components, discount: { type: 'percent', value: 10, maxMinor: rupees(15_000) } }).discountMinor).toBe(rupees(15_000));
    const fixed = calculateFee({ durationMonths: 24, components, discount: { type: 'fixed', value: rupees(999_999) } });
    expect(fixed.discountMinor).toBe(rupees(200_000));
    expect(fixed.officialAfterDiscountMinor).toBe(rupees(50_000));
  });

  it('refuses fractional, negative or duplicate amounts', () => {
    const base = { durationMonths: 12 };
    expect(() => calculateFee({ ...base, components: [{ key: 'tuition', amountMinor: 10.5, frequency: 'per_year' }] })).toThrow(RangeError);
    expect(() => calculateFee({ ...base, components: [{ key: 'tuition', amountMinor: -1, frequency: 'per_year' }] })).toThrow(RangeError);
    expect(() =>
      calculateFee({
        ...base,
        components: [
          { key: 'tuition', amountMinor: 1, frequency: 'per_year' },
          { key: 'tuition', amountMinor: 1, frequency: 'per_year' },
        ],
      }),
    ).toThrow(RangeError);
  });
});

describe('fee versions (pricing.manage)', () => {
  useTestDb();

  const draft = (tuition: number, extra: object = {}) => ({
    academicYear: '2026-27',
    intake: 'July',
    components: [
      { key: 'tuition', amountMinor: rupees(tuition), frequency: 'per_year' },
      { key: 'registration', amountMinor: rupees(5_000), frequency: 'one_time' },
    ],
    consultancyServiceChargeMinor: rupees(10_000),
    ...extra,
  });

  it('draft -> publish; a second publish supersedes the first and keeps the history; published fees are immutable', async () => {
    const p = await seedPlaces();
    const { college, offering } = await makeCollege({ slug: 'alpha', location: p.noida._id, course: p.btech._id });
    const { c } = await createAdmin();

    const d1 = await c.post(`/api/admin/offerings/${offering._id}/fees`, draft(100_000));
    expect(d1.status, JSON.stringify(d1.body)).toBe(201);
    expect(d1.body.data).toMatchObject({ status: 'draft', version: 1 });
    expect(d1.body.data.breakdown.officialTotalMinor).toBe(rupees(405_000));

    // Drafts are never public.
    expect((await request(app).get('/api/colleges/alpha')).body.data.offerings[0].fees).toEqual([]);

    // Publishing needs the official source and verification date.
    const notReady = await c.post(`/api/admin/fees/${d1.body.data.id}/publish`);
    expect(notReady.status).toBe(422);
    expect(notReady.body.error.code).toBe('NOT_READY');
    await c.put(`/api/admin/fees/${d1.body.data.id}`, draft(100_000, { sourceRef: 'https://example.edu/fees-2026.pdf', lastVerifiedAt: '2026-06-01' }));
    expect((await c.post(`/api/admin/fees/${d1.body.data.id}/publish`)).body.data.status).toBe('published');

    // The college's derived fee range follows the published fee.
    const listed = await request(app).get('/api/colleges');
    expect(listed.body.data[0].feeFromMinor).toBe(rupees(405_000));

    // A published version cannot be edited.
    const locked = await c.put(`/api/admin/fees/${d1.body.data.id}`, draft(1));
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('FEE_LOCKED');

    const d2 = await c.post(`/api/admin/offerings/${offering._id}/fees`, draft(120_000, { sourceRef: 'Fee circular 12/2026', lastVerifiedAt: '2026-07-01' }));
    expect(d2.body.data.version).toBe(2);
    expect((await c.post(`/api/admin/fees/${d2.body.data.id}/publish`)).status).toBe(200);

    const history = (await c.get(`/api/admin/offerings/${offering._id}/fees`)).body.data;
    expect(history.map((f: { version: number; status: string }) => [f.version, f.status])).toEqual([
      [2, 'published'],
      [1, 'superseded'],
    ]);
    expect(await CollegeFeeModel.countDocuments({ college: college._id, status: 'published' })).toBe(1);
    const pub = (await request(app).get('/api/colleges/alpha')).body.data.offerings[0].fees;
    expect(pub).toHaveLength(1);
    expect(pub[0].breakdown.officialTotalMinor).toBe(rupees(485_000));
    expect((await request(app).get('/api/colleges')).body.data[0].feeFromMinor).toBe(rupees(485_000));
    expect(await AuditLogModel.countDocuments({ action: 'pricing.fee_published' })).toBe(2);
  });

  it('the server computes totals; client totals and unknown fields are refused', async () => {
    const p = await seedPlaces();
    const { offering } = await makeCollege({ slug: 'alpha', location: p.noida._id, course: p.btech._id });
    const { c } = await createAdmin();
    expect((await c.post(`/api/admin/offerings/${offering._id}/fees`, { ...draft(100_000), officialTotalMinor: 1 })).status).toBe(422);
    expect((await c.post(`/api/admin/offerings/${offering._id}/fees`, draft(100_000.005))).status).toBe(422);
    expect((await c.post(`/api/admin/offerings/${offering._id}/fees`, { ...draft(100_000), academicYear: '2026-28' })).status).toBe(422);
    const preview = await c.post('/api/admin/fees/preview', { durationMonths: 24, components: [{ key: 'tuition', amountMinor: rupees(50_000), frequency: 'per_semester' }] });
    expect(preview.body.data.officialTotalMinor).toBe(rupees(200_000));
  });

  it('separates permissions: catalogue admins cannot change fees, pricing admins cannot edit colleges, students neither', async () => {
    const p = await seedPlaces();
    const { college, offering } = await makeCollege({ slug: 'alpha', location: p.noida._id, course: p.btech._id });
    await createAdmin();
    const cat = await createLimitedAdmin(['catalog.manage']);
    const price = await createLimitedAdmin(['pricing.manage']);

    expect((await cat.c.post(`/api/admin/offerings/${offering._id}/fees`, draft(1))).status).toBe(403);
    expect((await cat.c.post('/api/admin/fees/preview', { durationMonths: 12, components: [] })).status).toBe(403);
    expect((await price.c.patch(`/api/admin/colleges/${college._id}`, { name: 'Renamed' })).status).toBe(403);
    expect((await price.c.post('/api/admin/colleges', { name: 'New', slug: 'new', type: 'private' })).status).toBe(403);
    // Pricing admins may read the college they price.
    expect((await price.c.get(`/api/admin/colleges/${college._id}`)).status).toBe(200);
    expect((await price.c.post(`/api/admin/offerings/${offering._id}/fees`, draft(1))).status).toBe(201);
  });
});
