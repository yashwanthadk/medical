import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, VAULT_DIRECTORY } from './server/db.ts';
import type { DbReportRow, DbUserRow } from './server/db.ts';
import {
  decryptBuffer,
  encryptBuffer,
  generateOpaqueToken,
  getSessionSecret,
  hashPassword,
  hashToken,
  verifyPassword,
} from './server/crypto.ts';
import {
  analyzeBloodReport,
  analyzeMedicalImage,
  GeminiServiceError,
  isAiConfigured,
} from './server/gemini.ts';
import type {
  AuthUser,
  MedicalAnalysisResult,
  ModuleType,
  PatientContext,
  SubType,
} from './src/types/medical.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE_NAME = 'mediscan_sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

interface AuthedRequest extends Request {
  authUser?: AuthUser;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function toPublicUser(row: DbUserRow): AuthUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    emailVerified: row.email_verified === 1,
    createdAt: row.created_at,
  };
}

function isHttpsRequest(req: Request): boolean {
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded.split(',')[0].trim() === 'https') {
    return true;
  }
  return req.secure || process.env.NODE_ENV === 'production';
}

function setSessionCookie(req: Request, res: Response, rawToken: string): void {
  const https = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function clearSessionCookie(req: Request, res: Response): void {
  const https = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
  });
}

function createSessionForUser(req: Request, res: Response, userId: string): string {
  const rawToken = generateOpaqueToken(32);
  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(crypto.randomUUID(), userId, tokenHash, expiresAt, now);

  setSessionCookie(req, res, rawToken);
  return rawToken;
}

function extractRawSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (cookieToken && typeof cookieToken === 'string') {
    return cookieToken;
  }
  return null;
}

function getAuthenticatedUser(req: Request): AuthUser | null {
  const rawToken = extractRawSessionToken(req);
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, new Date().toISOString()) as DbUserRow | undefined;

  if (!row) return null;
  return toPublicUser(row);
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({
      code: 'AUTH_REQUIRED',
      error: 'Your session expired or is missing. Please sign in again.',
    });
    return;
  }
  req.authUser = user;
  next();
}

function handleSingleFileUpload(req: Request, res: Response, next: NextFunction): void {
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
    console.error('[Upload Middleware Error]', err);
    res.status(400).json({
      code: 'UPLOAD_ERROR',
      error: 'Unable to process uploaded file. Please try selecting the file again.',
    });
  });
}

function detectFileSignature(buffer: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
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

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'medical-report';
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extractPatientContext(body: Record<string, unknown>, fallbackName: string): PatientContext {
  return {
    patientName: String(body.patientName || fallbackName || 'Patient').trim().slice(0, 100),
    patientAge: String(body.patientAge || '').trim().slice(0, 20),
    patientSex: String(body.patientSex || '').trim().slice(0, 30),
    reportDateLabel: String(body.reportDateLabel || new Date().toISOString().slice(0, 10))
      .trim()
      .slice(0, 40),
    clinicalNotes: String(body.clinicalNotes || '').trim().slice(0, 1000),
  };
}

function saveEncryptedReport(params: {
  userId: string;
  moduleType: ModuleType;
  subType: SubType;
  patientContext: PatientContext;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
  analysis: MedicalAnalysisResult;
}): string {
  const reportId = crypto.randomUUID();
  const vaultFileName = `${reportId}.enc`;
  const { ciphertext, iv, authTag } = encryptBuffer(params.fileBuffer);
  fs.writeFileSync(path.join(VAULT_DIRECTORY, vaultFileName), ciphertext, { mode: 0o600 });

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO reports (
      id, user_id, module_type, sub_type,
      patient_name, patient_age, patient_sex, report_date_label, clinical_notes,
      file_name, mime_type, file_size, vault_file_name, file_iv, file_auth_tag,
      status, analysis_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    reportId,
    params.userId,
    params.moduleType,
    params.subType,
    params.patientContext.patientName,
    params.patientContext.patientAge,
    params.patientContext.patientSex,
    params.patientContext.reportDateLabel,
    params.patientContext.clinicalNotes,
    sanitizeFilename(params.fileName),
    params.mimeType,
    params.fileBuffer.length,
    vaultFileName,
    iv,
    authTag,
    params.analysis.overallStatus,
    JSON.stringify(params.analysis),
    now,
  );

  return reportId;
}

function unlinkVaultFile(vaultFileName: string): void {
  const safeName = path.basename(vaultFileName);
  const fullPath = path.join(VAULT_DIRECTORY, safeName);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

function sendAnalysisError(res: Response, label: string, error: unknown): void {
  if (error instanceof GeminiServiceError) {
    console.error(`[${label}] ${error.code}: ${error.message}`);
    res.status(error.httpStatus).json({
      code: error.code,
      error: error.message,
    });
    return;
  }
  console.error(`[${label} Unexpected Error]`, error);
  res.status(500).json({
    code: 'SERVER_ERROR',
    error: 'Unexpected server error while processing your medical report. Please try again.',
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);

  // CORS support for preview proxies and multi-origin clients
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(cookieParser(getSessionSecret()));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      aiConfigured: isAiConfigured(),
    });
  });

  // --- AUTHENTICATION ROUTES ---

  app.post('/api/auth/register', (req, res) => {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (fullName.length < 2 || fullName.length > 100) {
      res.status(400).json({ error: 'Please enter your full name (2–100 characters).' });
      return;
    }
    if (!validateEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      res.status(400).json({ error: 'Password must include both letters and at least one number.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const verificationToken = generateOpaqueToken(24);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      `INSERT INTO users (
        id, full_name, email, password_hash, email_verified,
        verification_token_hash, verification_expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    ).run(
      userId,
      fullName,
      email,
      hashPassword(password),
      hashToken(verificationToken),
      verificationExpires,
      now,
      now,
    );

    const sessionToken = createSessionForUser(req, res, userId);

    const createdRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUserRow;
    res.status(201).json({
      user: toPublicUser(createdRow),
      sessionToken,
      verificationToken,
      message: 'Account created securely. Please verify your email address.',
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!validateEmail(email) || !password) {
      res.status(400).json({ error: 'Email address and password are required.' });
      return;
    }

    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as DbUserRow | undefined;
    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      res.status(401).json({ error: 'Invalid email address or password.' });
      return;
    }

    const sessionToken = createSessionForUser(req, res, userRow.id);
    res.json({ user: toPublicUser(userRow), sessionToken });
  });

  app.post('/api/auth/logout', (req, res) => {
    const rawToken = extractRawSessionToken(req);
    if (rawToken) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(rawToken));
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user, aiConfigured: isAiConfigured() });
  });

  app.post('/api/auth/verify-email', (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Verification token is required.' });
      return;
    }

    const tokenHash = hashToken(token);
    const now = new Date().toISOString();
    const userRow = db
      .prepare(
        `SELECT * FROM users
         WHERE verification_token_hash = ? AND verification_expires_at > ?`,
      )
      .get(tokenHash, now) as DbUserRow | undefined;

    if (!userRow) {
      res.status(400).json({ error: 'Verification link is invalid or has expired.' });
      return;
    }

    db.prepare(
      `UPDATE users
       SET email_verified = 1, verification_token_hash = NULL, verification_expires_at = NULL, updated_at = ?
       WHERE id = ?`,
    ).run(now, userRow.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userRow.id) as DbUserRow;
    res.json({ user: toPublicUser(updated), message: 'Email verified successfully.' });
  });

  app.post('/api/auth/resend-verification', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.emailVerified) {
      res.json({ message: 'Your email address is already verified.', alreadyVerified: true });
      return;
    }

    const verificationToken = generateOpaqueToken(24);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `UPDATE users
       SET verification_token_hash = ?, verification_expires_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(hashToken(verificationToken), expiresAt, new Date().toISOString(), user.id);

    res.json({
      verificationToken,
      message: 'A fresh verification link has been generated.',
    });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!validateEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
    if (!userRow) {
      res.json({
        message: 'If an account matches that email address, a password reset link has been prepared.',
      });
      return;
    }

    const resetToken = generateOpaqueToken(24);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      `UPDATE users
       SET reset_token_hash = ?, reset_expires_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(hashToken(resetToken), expiresAt, new Date().toISOString(), userRow.id);

    res.json({
      resetToken,
      message: 'Password reset link prepared. It remains valid for 60 minutes.',
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!token) {
      res.status(400).json({ error: 'Reset token is required.' });
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      res.status(400).json({
        error: 'New password must be at least 8 characters and include letters and numbers.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }

    const now = new Date().toISOString();
    const userRow = db
      .prepare('SELECT * FROM users WHERE reset_token_hash = ? AND reset_expires_at > ?')
      .get(hashToken(token), now) as DbUserRow | undefined;

    if (!userRow) {
      res.status(400).json({ error: 'Password reset link is invalid or has expired.' });
      return;
    }

    db.prepare(
      `UPDATE users
       SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL, updated_at = ?
       WHERE id = ?`,
    ).run(hashPassword(newPassword), now, userRow.id);

    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userRow.id);
    clearSessionCookie(req, res);

    res.json({ message: 'Password updated successfully. You can now sign in.' });
  });

  app.patch('/api/auth/profile', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const fullName = req.body?.fullName !== undefined ? String(req.body.fullName).trim() : undefined;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUserRow;

    if (fullName !== undefined) {
      if (fullName.length < 2 || fullName.length > 100) {
        res.status(400).json({ error: 'Full name must be between 2 and 100 characters.' });
        return;
      }
      db.prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?').run(
        fullName,
        new Date().toISOString(),
        user.id,
      );
    }

    if (newPassword) {
      if (!verifyPassword(currentPassword, userRow.password_hash)) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }
      if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        res.status(400).json({
          error: 'New password must be at least 8 characters and include letters and numbers.',
        });
        return;
      }
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        hashPassword(newPassword),
        new Date().toISOString(),
        user.id,
      );
    }

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUserRow;
    res.json({ user: toPublicUser(updated), message: 'Profile settings saved.' });
  });

  app.delete('/api/auth/account', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const confirmEmail = String(req.body?.confirmEmail || '').trim().toLowerCase();
    if (confirmEmail !== user.email.toLowerCase()) {
      res.status(400).json({ error: 'Please type your exact email address to confirm account deletion.' });
      return;
    }

    const userReports = db
      .prepare('SELECT vault_file_name FROM reports WHERE user_id = ?')
      .all(user.id) as { vault_file_name: string }[];

    for (const r of userReports) {
      unlinkVaultFile(r.vault_file_name);
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    clearSessionCookie(req, res);
    res.json({ ok: true, message: 'Account and all encrypted medical records have been permanently deleted.' });
  });

  // --- MEDICAL REPORT & ANALYSIS ROUTES ---

  app.get('/api/reports', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const rows = db
      .prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC')
      .all(user.id) as DbReportRow[];

    const summaries = rows.map((row) => {
      const parsed = JSON.parse(row.analysis_json) as MedicalAnalysisResult;
      return {
        id: row.id,
        moduleType: row.module_type as ModuleType,
        subType: row.sub_type as SubType,
        patientName: row.patient_name,
        reportDateLabel: row.report_date_label,
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        status: row.status,
        analysisTitle: parsed.analysisTitle,
        finalSummary: parsed.finalSummary,
        createdAt: row.created_at,
      };
    });

    res.json({ reports: summaries });
  });

  app.get('/api/reports/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const row = db
      .prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?')
      .get(req.params.id, user.id) as DbReportRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Medical report not found or access denied.' });
      return;
    }

    res.json({
      report: {
        id: row.id,
        userId: row.user_id,
        moduleType: row.module_type,
        subType: row.sub_type,
        patientName: row.patient_name,
        patientAge: row.patient_age,
        patientSex: row.patient_sex,
        reportDateLabel: row.report_date_label,
        clinicalNotes: row.clinical_notes,
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        status: row.status,
        analysis: JSON.parse(row.analysis_json) as MedicalAnalysisResult,
        createdAt: row.created_at,
      },
    });
  });

  app.get('/api/reports/:id/file', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const row = db
      .prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?')
      .get(req.params.id, user.id) as DbReportRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'File not found or access denied.' });
      return;
    }

    const safePath = path.join(VAULT_DIRECTORY, path.basename(row.vault_file_name));
    if (!fs.existsSync(safePath)) {
      res.status(404).json({ error: 'Encrypted file payload missing from vault.' });
      return;
    }

    const ciphertext = fs.readFileSync(safePath);
    const plaintext = decryptBuffer(ciphertext, row.file_iv, row.file_auth_tag);

    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${row.file_name}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(plaintext);
  });

  app.delete('/api/reports/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const row = db
      .prepare('SELECT id, vault_file_name FROM reports WHERE id = ? AND user_id = ?')
      .get(req.params.id, user.id) as { id: string; vault_file_name: string } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Medical report not found or access denied.' });
      return;
    }

    unlinkVaultFile(row.vault_file_name);
    db.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').run(row.id, user.id);
    res.json({ ok: true });
  });

  app.post(
    '/api/analyze/blood',
    requireAuth,
    handleSingleFileUpload,
    async (req: AuthedRequest, res) => {
      try {
        if (!isAiConfigured()) {
          res.status(503).json({
            code: 'AI_NOT_CONFIGURED',
            error: 'Gemini AI service is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
          });
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({
            code: 'MISSING_FILE',
            error: 'No file received by server. Please upload a Blood Report (PDF, JPG, JPEG, or PNG).',
          });
          return;
        }

        const detectedMime = detectFileSignature(file.buffer);
        if (!detectedMime) {
          res.status(400).json({
            code: 'UNSUPPORTED_FORMAT',
            error: 'Unsupported or corrupted file format. Only valid PDF, JPG, JPEG, or PNG files are accepted.',
          });
          return;
        }

        const patientContext = extractPatientContext(
          req.body as Record<string, unknown>,
          req.authUser!.fullName,
        );
        const extractedPdfText = String(req.body?.extractedPdfText || '');

        const analysis = await analyzeBloodReport({
          fileBuffer: file.buffer,
          mimeType: detectedMime,
          extractedPdfText,
          patientContext,
        });

        const reportId = saveEncryptedReport({
          userId: req.authUser!.id,
          moduleType: 'blood',
          subType: 'blood_panel',
          patientContext,
          fileName: file.originalname,
          mimeType: detectedMime,
          fileBuffer: file.buffer,
          analysis,
        });

        res.status(201).json({ reportId, analysis });
      } catch (error) {
        sendAnalysisError(res, 'Blood Analysis', error);
      }
    },
  );

  app.post(
    '/api/analyze/xray',
    requireAuth,
    handleSingleFileUpload,
    async (req: AuthedRequest, res) => {
      try {
        if (!isAiConfigured()) {
          res.status(503).json({
            code: 'AI_NOT_CONFIGURED',
            error: 'Gemini AI service is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
          });
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({
            code: 'MISSING_FILE',
            error: 'No file received by server. Please upload an X-ray image (JPG, JPEG, or PNG).',
          });
          return;
        }

        const detectedMime = detectFileSignature(file.buffer);
        if (detectedMime !== 'image/jpeg' && detectedMime !== 'image/png') {
          res.status(400).json({
            code: 'UNSUPPORTED_FORMAT',
            error: 'Unsupported image format. X-ray analysis accepts JPG, JPEG, or PNG images only.',
          });
          return;
        }

        const rawSubType = String(req.body?.subType || '');
        if (rawSubType !== 'bone_xray' && rawSubType !== 'chest_xray') {
          res.status(400).json({
            code: 'INVALID_CATEGORY',
            error: 'Please choose either Bone X-ray or Chest X-ray.',
          });
          return;
        }

        const patientContext = extractPatientContext(
          req.body as Record<string, unknown>,
          req.authUser!.fullName,
        );
        const analysis = await analyzeMedicalImage({
          fileBuffer: file.buffer,
          mimeType: detectedMime,
          subType: rawSubType,
          patientContext,
        });

        const reportId = saveEncryptedReport({
          userId: req.authUser!.id,
          moduleType: 'xray',
          subType: rawSubType,
          patientContext,
          fileName: file.originalname,
          mimeType: detectedMime,
          fileBuffer: file.buffer,
          analysis,
        });

        res.status(201).json({ reportId, analysis });
      } catch (error) {
        sendAnalysisError(res, 'X-ray Analysis', error);
      }
    },
  );

  app.post(
    '/api/analyze/mri',
    requireAuth,
    handleSingleFileUpload,
    async (req: AuthedRequest, res) => {
      try {
        if (!isAiConfigured()) {
          res.status(503).json({
            code: 'AI_NOT_CONFIGURED',
            error: 'Gemini AI service is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
          });
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({
            code: 'MISSING_FILE',
            error: 'No file received by server. Please upload an MRI scan image (JPG, JPEG, or PNG).',
          });
          return;
        }

        const detectedMime = detectFileSignature(file.buffer);
        if (detectedMime !== 'image/jpeg' && detectedMime !== 'image/png') {
          res.status(400).json({
            code: 'UNSUPPORTED_FORMAT',
            error: 'Unsupported image format. MRI analysis accepts JPG, JPEG, or PNG images only.',
          });
          return;
        }

        const rawSubType = String(req.body?.subType || '');
        if (
          rawSubType !== 'brain_mri' &&
          rawSubType !== 'muscle_mri' &&
          rawSubType !== 'soft_tissue_mri'
        ) {
          res.status(400).json({
            code: 'INVALID_CATEGORY',
            error: 'Please choose Brain MRI, Muscle MRI, or Soft Tissue MRI.',
          });
          return;
        }

        const patientContext = extractPatientContext(
          req.body as Record<string, unknown>,
          req.authUser!.fullName,
        );
        const analysis = await analyzeMedicalImage({
          fileBuffer: file.buffer,
          mimeType: detectedMime,
          subType: rawSubType,
          patientContext,
        });

        const reportId = saveEncryptedReport({
          userId: req.authUser!.id,
          moduleType: 'mri',
          subType: rawSubType,
          patientContext,
          fileName: file.originalname,
          mimeType: detectedMime,
          fileBuffer: file.buffer,
          analysis,
        });

        res.status(201).json({ reportId, analysis });
      } catch (error) {
        sendAnalysisError(res, 'MRI Analysis', error);
      }
    },
  );

  // Guarantee JSON error responses for all /api/* routes (never HTML)
  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', error: 'API endpoint not found.' });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      console.error('[API Error Middleware]', err);
      res.status(500).json({
        code: 'SERVER_ERROR',
        error: 'Unexpected server error occurred.',
      });
      return;
    }
    next(err);
  });

  // Vite dev middleware or production static assets
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MediScan AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MediScan AI server:', err);
  process.exit(1);
});
