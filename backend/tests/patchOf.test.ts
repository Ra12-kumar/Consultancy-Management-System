import { describe, expect, it } from 'vitest';
import { collegePatch, coursePatch, locationPatch, offeringPatch } from '../src/validators/catalog.validators.js';
import { scholarshipPatch } from '../src/validators/scholarship.validators.js';

// PATCH validators must never fill absent fields with defaults (that would overwrite stored values).
describe('partial-update validators', () => {
  it('keep only the fields that were sent', () => {
    for (const schema of [collegePatch, coursePatch, locationPatch, offeringPatch, scholarshipPatch]) expect(schema.parse({})).toEqual({});
    expect(collegePatch.parse({ about: 'New text' })).toEqual({ about: 'New text' });
  });
  it('still refuse unknown fields', () => {
    expect(collegePatch.safeParse({ status: 'published', nope: 1 }).success).toBe(false);
  });
});
