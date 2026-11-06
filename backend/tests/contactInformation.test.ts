import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/models/AuditLog.js';
import { SiteSettingsModel } from '../src/models/Content.js';
import { app, createAdmin, createLimitedAdmin, useTestDb } from './helpers.js';

useTestDb();

// Test values only (example.com / example addresses).
const details = {
  name: 'Example Consultancy',
  contactPerson: 'Asha Rao',
  supportEmail: 'Info@Example.com',
  supportPhone: '+91 98765 43210',
  whatsapp: '+91 98765 43210',
  address: '2nd Floor, Example Tower\nNoida 201301',
  mapsUrl: 'https://maps.app.goo.gl/abc123',
  officeHours: 'Mon–Sat, 10:00 am – 6:00 pm',
  instagram: 'https://www.instagram.com/example',
  facebook: 'https://facebook.com/example',
  linkedin: 'https://www.linkedin.com/company/example',
  youtube: 'https://www.youtube.com/@example',
  x: 'https://x.com/example',
};

describe('Admin → Contact information', () => {
  it('saves every field in MongoDB and the public site endpoint returns them right away', async () => {
    const { c } = await createAdmin();
    expect((await request(app).get('/api/site')).body.data.organisation).toMatchObject({ name: '', contactPerson: '', mapsUrl: '', linkedin: '' });
    const res = await c.put('/api/admin/settings/site', { organisation: details });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const stored = await SiteSettingsModel.findById('site').lean();
    expect(stored!.organisation).toMatchObject({ ...details, supportEmail: 'info@example.com' });
    expect((await request(app).get('/api/site')).body.data.organisation).toMatchObject({ ...details, supportEmail: 'info@example.com' });
    expect(await AuditLogModel.exists({ action: 'settings.organisation_updated' })).toBeTruthy();

    // A partial save changes only what was sent; an empty value clears a field.
    await c.put('/api/admin/settings/site', { organisation: { contactPerson: 'Ravi Kumar', youtube: '' } });
    expect((await request(app).get('/api/site')).body.data.organisation).toMatchObject({ contactPerson: 'Ravi Kumar', youtube: '', linkedin: details.linkedin, name: details.name });
  });

  it('refuses invalid values with a message per field', async () => {
    const { c } = await createAdmin();
    const bad = {
      supportEmail: 'not-an-email',
      supportPhone: 'call me',
      whatsapp: '12',
      mapsUrl: 'https://example.com/maps',
      linkedin: 'https://facebook.com/someone',
      youtube: 'http://youtube.com/@example',
      x: 'javascript:alert(1)',
      contactPerson: 'x'.repeat(121),
    };
    const res = await c.put('/api/admin/settings/site', { organisation: bad });
    expect(res.status).toBe(422);
    const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field.replace(/^organisation\./, ''));
    for (const k of Object.keys(bad)) expect(fields, k).toContain(k);
    // Unknown fields are refused too, and nothing was stored.
    expect((await c.put('/api/admin/settings/site', { organisation: { tiktok: 'https://tiktok.com/@x' } })).status).toBe(422);
    expect(await SiteSettingsModel.findById('site').lean()).toBeNull();
    // Google Maps links in their usual forms are accepted.
    for (const mapsUrl of ['https://www.google.com/maps/place/Example', 'https://maps.google.com/?q=28.5,77.3', 'https://goo.gl/maps/abc', 'https://maps.app.goo.gl/xyz']) {
      expect((await c.put('/api/admin/settings/site', { organisation: { mapsUrl } })).status, mapsUrl).toBe(200);
    }
  });

  it('is limited to admins who manage settings', async () => {
    const limited = await createLimitedAdmin(['students.read']);
    expect((await limited.c.put('/api/admin/settings/site', { organisation: { name: 'X' } })).status).toBe(403);
    expect((await request(app).put('/api/admin/settings/site').send({ organisation: { name: 'X' } })).status).toBe(401);
  });
});
