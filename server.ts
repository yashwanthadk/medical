import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './server/db.ts';
import type { DbReportRow, DbUserRow } from './server/db.ts';
import {
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
import { generateServerMedicalPdfBuffer } from './server/pdfGenerator.ts';
import {
  acquireInFlightLock,
  createRateLimiter,
  releaseInFlightLock,
} from './server/rateLimit.ts';
import {
  extractPdfTextServer,
  handleSingleFileUpload,
  readDecryptedVaultFile,
  sanitizeFilename,
  storeEncryptedVaultFile,
  unlinkVaultFile,
  UploadValidationError,
  validateUploadedMedicalFile,
} from './server/upload.ts';
import type {
  AuthUser,
  MedicalAnalysisResult,
  MedicalReportRecord,
  ModuleType,
  PatientContext,
  SubType,
} from './src/types/medical.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE_NAME = 'mediscan_sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEDICAL_DISCLAIMER = 'Educational information only. Not a medical diagnosis.';

interface AuthedRequest extends Request {
  authUser?: AuthUser;
}

const authRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: 'auth',
});

const analysisRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  keyPrefix: 'analysis',
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
      error: 'Authentication required. Please sign in.',
    });
    return;
  }
  req.authUser = user;
  next();
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

function toReportRecord(row: DbReportRow): MedicalReportRecord {
  return {
    id: row.id,
    userId: row.user_id,
    moduleType: row.module_type as ModuleType,
    subType: row.sub_type as SubType,
    patientName: row.patient_name,
    patientAge: row.patient_age,
    patientSex: row.patient_sex,
    reportDateLabel: row.report_date_label,
    clinicalNotes: row.clinical_notes,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    status: row.status as MedicalAnalysisResult['overallStatus'],
    analysis: JSON.parse(row.analysis_json) as MedicalAnalysisResult,
    createdAt: row.created_at,
  };
}

function formatStandardResults(analysis: MedicalAnalysisResult) {
  return {
    keyObservations: analysis.keyObservations,
    normalFindings: analysis.normalFindings,
    flaggedFindings: analysis.abnormalFindings,
    explanation: analysis.simpleExplanation,
    imageQuality: `${analysis.qualityAssessment.rating.toUpperCase()}: ${analysis.qualityAssessment.details}`,
    limitations: analysis.limitations,
    finalSummary: analysis.finalSummary,
    bloodParameters: analysis.bloodParameters,
    imagingObservations: analysis.imagingObservations,
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
  const { vaultFileName, iv, authTag } = storeEncryptedVaultFile(reportId, params.fileBuffer);

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

function getOwnedReportOrError(
  reportId: string,
  userId: string,
  res: Response,
  expectedModule?: ModuleType,
): DbReportRow | null {
  const row = db
    .prepare('SELECT * FROM reports WHERE id = ?')
    .get(reportId) as DbReportRow | undefined;

  if (!row) {
    res.status(404).json({ code: 'NOT_FOUND', error: 'Medical report not found.' });
    return null;
  }
  if (row.user_id !== userId) {
    res.status(403).json({ code: 'FORBIDDEN', error: 'Access denied to another user’s medical report.' });
    return null;
  }
  if (expectedModule && row.module_type !== expectedModule) {
    res.status(404).json({ code: 'NOT_FOUND', error: `No ${expectedModule} analysis found for this ID.` });
    return null;
  }
  return row;
}

function sendAnalysisError(res: Response, label: string, error: unknown): void {
  if (error instanceof UploadValidationError) {
    res.status(error.httpStatus).json({
      code: error.code,
      error: error.message,
    });
    return;
  }
  if (error instanceof GeminiServiceError) {
    console.error(`[${label}]`, { code: error.code, status: error.httpStatus });
    res.status(error.httpStatus).json({
      code: error.code,
      error: error.message,
    });
    return;
  }
  console.error(`[${label} Unexpected Error]`, error instanceof Error ? error.name : 'UnknownError');
  res.status(500).json({
    code: 'SERVER_ERROR',
    error: 'Unexpected server error while processing your medical report. Please try again.',
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);

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

  app.post('/api/auth/register', authRateLimiter, (req, res) => {
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

  app.post('/api/auth/login', authRateLimiter, (req, res) => {
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
      res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Not authenticated' });
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

  app.post('/api/auth/forgot-password', authRateLimiter, (req, res) => {
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

  app.post('/api/auth/reset-password', authRateLimiter, (req, res) => {
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

  // --- REPORTS & PDF ROUTES ---

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
    const row = getOwnedReportOrError(req.params.id, req.authUser!.id, res);
    if (!row) return;
    const report = toReportRecord(row);
    res.json({
      success: true,
      report,
      results: formatStandardResults(report.analysis),
      medicalDisclaimer: MEDICAL_DISCLAIMER,
    });
  });

  app.get('/api/reports/:id/file', requireAuth, (req: AuthedRequest, res) => {
    const row = getOwnedReportOrError(req.params.id, req.authUser!.id, res);
    if (!row) return;

    const plaintext = readDecryptedVaultFile(row.vault_file_name, row.file_iv, row.file_auth_tag);
    if (!plaintext) {
      res.status(404).json({ code: 'NOT_FOUND', error: 'Encrypted file payload missing from vault.' });
      return;
    }

    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${row.file_name}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(plaintext);
  });

  app.get('/api/reports/:id/pdf', requireAuth, (req: AuthedRequest, res) => {
    const row = getOwnedReportOrError(req.params.id, req.authUser!.id, res);
    if (!row) return;

    const report = toReportRecord(row);
    const pdfBuffer = generateServerMedicalPdfBuffer(report);
    const baseName = report.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="MediScan_Summary_${baseName}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdfBuffer);
  });

  app.delete('/api/reports/:id', requireAuth, (req: AuthedRequest, res) => {
    const row = getOwnedReportOrError(req.params.id, req.authUser!.id, res);
    if (!row) return;

    unlinkVaultFile(row.vault_file_name);
    db.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').run(row.id, req.authUser!.id);
    res.json({ success: true, ok: true });
  });

  // --- DEDICATED ANALYSIS HANDLERS (supporting both /api/analyze/* and /api/analysis/*) ---

  const handleBloodAnalysis = async (req: AuthedRequest, res: Response) => {
    let lockKey: string | null = null;
    try {
      const validated = validateUploadedMedicalFile(req.file, [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ]);

      if (!isAiConfigured()) {
        res.status(503).json({
          code: 'AI_NOT_CONFIGURED',
          error: 'Gemini AI service is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      lockKey = `${req.authUser!.id}:blood:${validated.sha256}`;
      if (!acquireInFlightLock(lockKey)) {
        res.status(409).json({
          code: 'DUPLICATE_REQUEST',
          error: 'This exact blood report is already being analyzed. Please wait for it to complete.',
        });
        return;
      }

      const patientContext = extractPatientContext(
        req.body as Record<string, unknown>,
        req.authUser!.fullName,
      );

      let extractedPdfText = String(req.body?.extractedPdfText || '').trim();
      if (validated.mimeType === 'application/pdf' && !extractedPdfText) {
        extractedPdfText = await extractPdfTextServer(validated.buffer);
      }

      const analysis = await analyzeBloodReport({
        fileBuffer: validated.buffer,
        mimeType: validated.mimeType,
        extractedPdfText,
        patientContext,
      });

      const reportId = saveEncryptedReport({
        userId: req.authUser!.id,
        moduleType: 'blood',
        subType: 'blood_panel',
        patientContext,
        fileName: validated.safeName,
        mimeType: validated.mimeType,
        fileBuffer: validated.buffer,
        analysis,
      });

      res.status(201).json({
        success: true,
        analysisId: reportId,
        reportId,
        reportType: 'blood',
        category: 'blood_panel',
        status: 'completed',
        analysis,
        results: formatStandardResults(analysis),
        medicalDisclaimer: MEDICAL_DISCLAIMER,
      });
    } catch (error) {
      sendAnalysisError(res, 'Blood Analysis', error);
    } finally {
      if (lockKey) releaseInFlightLock(lockKey);
    }
  };

  const handleXrayAnalysis = async (req: AuthedRequest, res: Response) => {
    let lockKey: string | null = null;
    try {
      const validated = validateUploadedMedicalFile(req.file, ['image/jpeg', 'image/png']);

      const rawSubType = String(req.body?.subType || req.body?.category || '');
      const normalizedSubType =
        rawSubType === 'bone' || rawSubType === 'bone_xray'
          ? 'bone_xray'
          : rawSubType === 'chest' || rawSubType === 'chest_xray'
            ? 'chest_xray'
            : null;

      if (!normalizedSubType) {
        res.status(400).json({
          code: 'INVALID_CATEGORY',
          error: 'Please choose either Bone X-ray or Chest X-ray.',
        });
        return;
      }

      if (!isAiConfigured()) {
        res.status(503).json({
          code: 'AI_NOT_CONFIGURED',
          error: 'Gemini AI service is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      lockKey = `${req.authUser!.id}:${normalizedSubType}:${validated.sha256}`;
      if (!acquireInFlightLock(lockKey)) {
        res.status(409).json({
          code: 'DUPLICATE_REQUEST',
          error: 'This exact X-ray image is already being analyzed. Please wait for it to complete.',
        });
        return;
      }

      const patientContext = extractPatientContext(
        req.body as Record<string, unknown>,
        req.authUser!.fullName,
      );

      const analysis = await analyzeMedicalImage({
        fileBuffer: validated.buffer,
        mimeType: validated.mimeType,
        subType: normalizedSubType,
        patientContext,
      });

      const reportId = saveEncryptedReport({
        userId: req.authUser!.id,
        moduleType: 'xray',
        subType: normalizedSubType,
        patientContext,
        fileName: validated.safeName,
        mimeType: validated.mimeType,
        fileBuffer: validated.buffer,
        analysis,
      });

      res.status(201).json({
        success: true,
        analysisId: reportId,
        reportId,
        reportType: 'xray',
        category: normalizedSubType === 'bone_xray' ? 'bone' : 'chest',
        status: 'completed',
        analysis,
        results: formatStandardResults(analysis),
        medicalDisclaimer: MEDICAL_DISCLAIMER,
      });
    } catch (error) {
      sendAnalysisError(res, 'X-ray Analysis', error);
    } finally {
      if (lockKey) releaseInFlightLock(lockKey);
    }
  };

  const handleMriAnalysis = async (req: AuthedRequest, res: Response) => {
    let lockKey: string | null = null;
    try {
      const validated = validateUploadedMedicalFile(req.file, ['image/jpeg', 'image/png']);

      const rawSubType = String(req.body?.subType || req.body?.category || '');
      const normalizedSubType =
        rawSubType === 'brain' || rawSubType === 'brain_mri'
          ? 'brain_mri'
          : rawSubType === 'muscle' || rawSubType === 'muscle_mri'
            ? 'muscle_mri'
            : rawSubType === 'soft_tissue' || rawSubType === 'soft_tissue_mri'
              ? 'soft_tissue_mri'
              : null;

      if (!normalizedSubType) {
        res.status(400).json({
          code: 'INVALID_CATEGORY',
          error: 'Please choose Brain MRI, Muscle MRI, or Soft Tissue MRI.',
        });
        return;
      }

      if (!isAiConfigured()) {
        res.status(503).json({
          code: 'AI_NOT_CONFIGURED',
          error: 'Gemini AI service is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      lockKey = `${req.authUser!.id}:${normalizedSubType}:${validated.sha256}`;
      if (!acquireInFlightLock(lockKey)) {
        res.status(409).json({
          code: 'DUPLICATE_REQUEST',
          error: 'This exact MRI scan is already being analyzed. Please wait for it to complete.',
        });
        return;
      }

      const patientContext = extractPatientContext(
        req.body as Record<string, unknown>,
        req.authUser!.fullName,
      );

      const analysis = await analyzeMedicalImage({
        fileBuffer: validated.buffer,
        mimeType: validated.mimeType,
        subType: normalizedSubType,
        patientContext,
      });

      const reportId = saveEncryptedReport({
        userId: req.authUser!.id,
        moduleType: 'mri',
        subType: normalizedSubType,
        patientContext,
        fileName: validated.safeName,
        mimeType: validated.mimeType,
        fileBuffer: validated.buffer,
        analysis,
      });

      res.status(201).json({
        success: true,
        analysisId: reportId,
        reportId,
        reportType: 'mri',
        category: normalizedSubType.replace('_mri', ''),
        status: 'completed',
        analysis,
        results: formatStandardResults(analysis),
        medicalDisclaimer: MEDICAL_DISCLAIMER,
      });
    } catch (error) {
      sendAnalysisError(res, 'MRI Analysis', error);
    } finally {
      if (lockKey) releaseInFlightLock(lockKey);
    }
  };

  app.post('/api/analyze/blood', requireAuth, analysisRateLimiter, handleSingleFileUpload, handleBloodAnalysis);
  app.post('/api/analysis/blood', requireAuth, analysisRateLimiter, handleSingleFileUpload, handleBloodAnalysis);

  app.post('/api/analyze/xray', requireAuth, analysisRateLimiter, handleSingleFileUpload, handleXrayAnalysis);
  app.post('/api/analysis/xray', requireAuth, analysisRateLimiter, handleSingleFileUpload, handleXrayAnalysis);

  app.post('/api/analyze/mri', requireAuth, analysisRateLimiter, handleSingleFileUpload, handleMriAnalysis);
  app.post('/api/analysis/mri', requireAuth, analysisRateLimiter, handleSingleFileUpload, handleMriAnalysis);

  const handleGetTypedAnalysis = (expectedModule: ModuleType) => (req: AuthedRequest, res: Response) => {
    const row = getOwnedReportOrError(req.params.id, req.authUser!.id, res, expectedModule);
    if (!row) return;
    const report = toReportRecord(row);
    res.json({
      success: true,
      analysisId: report.id,
      reportId: report.id,
      reportType: report.moduleType,
      category: report.subType,
      status: 'completed',
      report,
      results: formatStandardResults(report.analysis),
      medicalDisclaimer: MEDICAL_DISCLAIMER,
    });
  };

  app.get('/api/analysis/blood/:id', requireAuth, handleGetTypedAnalysis('blood'));
  app.get('/api/analysis/xray/:id', requireAuth, handleGetTypedAnalysis('xray'));
  app.get('/api/analysis/mri/:id', requireAuth, handleGetTypedAnalysis('mri'));

  // Guarantee JSON error responses for all /api/* routes (never HTML)
  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', error: 'API endpoint not found.' });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      console.error('[API Error Middleware]', err instanceof Error ? err.name : 'UnknownError');
      res.status(500).json({
        code: 'SERVER_ERROR',
        error: 'Unexpected server error occurred.',
      });
      return;
    }
    next(err);
  });

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
