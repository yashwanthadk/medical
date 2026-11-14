import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { decryptBuffer, encryptBuffer } from './crypto.ts';
import { VAULT_DIRECTORY } from './db.ts';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MIN_UPLOAD_BYTES = 64;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

export type AllowedMime = 'application/pdf' | 'image/jpeg' | 'image/png';

export class UploadValidationError extends Error {
  code: string;
  httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = 'UploadValidationError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function handleSingleFileUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          code: 'FILE_TOO_LARGE',
          error: 'Uploaded file is too large. Maximum allowed size is 15 MB.',
        });
        return;
      }
      res.status(400).json({
        code: 'UPLOAD_ERROR',
        error: `Upload failed: ${err.message}`,
      });
      return;
    }
    res.status(400).json({
      code: 'UPLOAD_ERROR',
      error: 'Unable to process uploaded file. Please try selecting the file again.',
    });
  });
}

export function detectFileSignature(buffer: Buffer): AllowedMime | null {
  if (buffer.length < 8) return null;
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'medical-report';
}

export function validateUploadedMedicalFile(
  file: Express.Multer.File | undefined,
  allowedMimes: AllowedMime[],
): { buffer: Buffer; mimeType: AllowedMime; safeName: string; sha256: string } {
  if (!file || !file.buffer) {
    throw new UploadValidationError(
      'MISSING_FILE',
      'No file received by server. Please attach a supported medical file.',
      400,
    );
  }

  if (file.buffer.length < MIN_UPLOAD_BYTES) {
    throw new UploadValidationError(
      'CORRUPTED_FILE',
      'Uploaded file appears empty or corrupted.',
      400,
    );
  }

  if (file.buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(
      'FILE_TOO_LARGE',
      'Uploaded file is too large. Maximum allowed size is 15 MB.',
      413,
    );
  }

  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExts = allowedMimes.flatMap((m) =>
    m === 'application/pdf' ? ['.pdf'] : m === 'image/jpeg' ? ['.jpg', '.jpeg'] : ['.png'],
  );

  if (ext && !allowedExts.includes(ext)) {
    throw new UploadValidationError(
      'UNSUPPORTED_FILE_TYPE',
      `Unsupported file extension (${ext}). Allowed formats: ${allowedExts.join(', ').toUpperCase()}.`,
      415,
    );
  }

  const detectedMime = detectFileSignature(file.buffer);
  if (!detectedMime || !allowedMimes.includes(detectedMime)) {
    throw new UploadValidationError(
      'UNSUPPORTED_FILE_TYPE',
      `Unsupported or corrupted file signature. Allowed formats: ${allowedExts.join(', ').toUpperCase()}.`,
      415,
    );
  }

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

  return {
    buffer: file.buffer,
    mimeType: detectedMime,
    safeName: sanitizeFilename(file.originalname),
    sha256,
  };
}

export async function extractPdfTextServer(buffer: Buffer): Promise<string> {
  try {
    const uint8 = new Uint8Array(buffer);
    const task = pdfjsLib.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await task.promise;
    const pages: string[] = [];
    const maxPages = Math.min(pdf.numPages, 12);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ');
      pages.push(line);
    }
    return pages.join('\n\n').trim();
  } catch {
    return '';
  }
}

export function storeEncryptedVaultFile(
  reportId: string,
  plaintext: Buffer,
): { vaultFileName: string; iv: string; authTag: string } {
  const vaultFileName = `${reportId}.enc`;
  const { ciphertext, iv, authTag } = encryptBuffer(plaintext);
  fs.writeFileSync(path.join(VAULT_DIRECTORY, vaultFileName), ciphertext, { mode: 0o600 });
  return { vaultFileName, iv, authTag };
}

export function readDecryptedVaultFile(
  vaultFileName: string,
  iv: string,
  authTag: string,
): Buffer | null {
  const safePath = path.join(VAULT_DIRECTORY, path.basename(vaultFileName));
  if (!fs.existsSync(safePath)) return null;
  const ciphertext = fs.readFileSync(safePath);
  return decryptBuffer(ciphertext, iv, authTag);
}

export function unlinkVaultFile(vaultFileName: string): void {
  const safeName = path.basename(vaultFileName);
  const fullPath = path.join(VAULT_DIRECTORY, safeName);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}
