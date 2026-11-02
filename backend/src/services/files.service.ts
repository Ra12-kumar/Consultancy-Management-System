import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { StoredFileModel } from '../models/Support.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

// Private uploads: files live in env.uploadDir (outside any public folder) under random names, and are only
// streamed through GET /api/files/:id after an ownership/permission check.

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const PDF_TYPES = ['application/pdf'] as const;
type Mime = (typeof PHOTO_TYPES)[number] | (typeof DOCUMENT_TYPES)[number];
const EXT: Record<Mime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// One file per request, held in memory only while it is checked and written.
export const singleUpload = (maxMb: number) => multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 5, parts: 8 } }).single('file');

// The real type comes from the file's first bytes, never from its name or the browser's claim.
export function sniff(buf: Buffer): Mime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

const cleanName = (name: string) => path.basename(name).replace(/[^\w.\- ()]/g, '_').slice(-100) || 'file';

export async function saveUpload(
  file: Express.Multer.File | undefined,
  o: { owner: string; uploadedBy: string; kind: 'photo' | 'document' | 'college_image' | 'brochure'; allowed: readonly Mime[]; enquiry?: unknown; documentId?: unknown },
) {
  if (!file?.buffer?.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a file to upload', [{ field: 'file', message: 'Choose a file' }]);
  const mime = sniff(file.buffer);
  if (!mime || !o.allowed.includes(mime)) {
    const kinds = o.allowed.map((m) => EXT[m].toUpperCase()).join(', ');
    throw new ApiError(415, 'UNSUPPORTED_FILE', `Upload a ${kinds} file`, [{ field: 'file', message: `Only ${kinds} files are accepted` }]);
  }
  const key = `${o.kind}s/${randomBytes(16).toString('hex')}.${EXT[mime]}`;
  const full = path.join(env.uploadDir, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, file.buffer, { flag: 'wx', mode: 0o600 });
  try {
    return await StoredFileModel.create({
      owner: o.owner,
      kind: o.kind,
      enquiry: o.enquiry ?? null,
      documentId: o.documentId ?? null,
      key,
      originalName: cleanName(file.originalname),
      mime,
      size: file.size,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      uploadedBy: o.uploadedBy,
    });
  } catch (err) {
    await fs.rm(full, { force: true });
    throw err;
  }
}

export async function deleteStoredFiles(filter: Record<string, unknown>) {
  const files = await StoredFileModel.find(filter).select('key').lean();
  for (const f of files) {
    await fs.rm(path.join(env.uploadDir, f.key), { force: true }).catch((err: Error) => logger.warn({ err: { message: err.message } }, 'Could not remove an uploaded file'));
  }
  return (await StoredFileModel.deleteMany({ _id: { $in: files.map((f) => f._id) } })).deletedCount;
}

// The owner, or an admin with the matching permission (photos: students.read; documents: enquiries.manage).
export async function streamFile(req: Request, res: Response, id: string) {
  const f = await StoredFileModel.findById(id).lean();
  const u = req.user!;
  const allowed = f && (String(f.owner) === u.id || (u.role === 'admin' && u.permissions.includes(f.kind === 'photo' ? 'students.read' : 'enquiries.manage')));
  if (!f || !allowed) throw ApiError.notFound('File not found');
  const full = path.join(env.uploadDir, f.key);
  try {
    await fs.access(full);
  } catch {
    throw ApiError.notFound('File not found');
  }
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Length', String(f.size));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // PDFs and images can be viewed inline, but never as active content.
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', `${f.kind === 'photo' ? 'inline' : 'attachment'}; filename="${f.originalName.replace(/"/g, '')}"`);
  await new Promise<void>((resolve, reject) => createReadStream(full).on('error', reject).on('end', resolve).pipe(res));
}
