import { GoogleGenAI, Type } from '@google/genai';
import type {
  MedicalAnalysisResult,
  PatientContext,
  SubType,
} from '../src/types/medical.ts';

const MODEL_NAME = 'gemini-4-hydrogen';
const GEMINI_TIMEOUT_MS = 65_000;

export class GeminiServiceError extends Error {
  code: string;
  httpStatus: number;

  constructor(code: string, message: string, httpStatus = 500) {
    super(message);
    this.name = 'GeminiServiceError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isAiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

function extractErrorDetails(err: unknown): { status?: number; message: string } {
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    const status =
      typeof record.status === 'number'
        ? record.status
        : typeof record.statusCode === 'number'
          ? record.statusCode
          : undefined;
    const message =
      typeof record.message === 'string'
        ? record.message
        : err instanceof Error
          ? err.message
          : String(err);
    return { status, message };
  }
  return { message: String(err) };
}

function isTransientError(err: unknown): boolean {
  const { status, message } = extractErrorDetails(err);
  const lower = message.toLowerCase();
  return (
    status === 503 ||
    status === 502 ||
    status === 500 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout')
  );
}

function mapGeminiError(err: unknown): GeminiServiceError {
  if (err instanceof GeminiServiceError) return err;

  const { status, message } = extractErrorDetails(err);
  const lower = message.toLowerCase();

  if (lower.includes('ai_timeout') || lower.includes('timed out') || lower.includes('abort')) {
    return new GeminiServiceError(
      'ANALYSIS_TIMEOUT',
      'Analysis request timed out while waiting for the AI service. Please try again.',
      504,
    );
  }

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthorized')
  ) {
    return new GeminiServiceError(
      'INVALID_API_KEY',
      'Invalid or unauthorized Gemini API key. Please check GEMINI_API_KEY in Settings > Secrets.',
      502,
    );
  }

  if (
    status === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return new GeminiServiceError(
      'QUOTA_EXCEEDED',
      'Gemini API quota exceeded. Please wait briefly or check your billing quota in Settings > Secrets.',
      429,
    );
  }

  if (status === 503 || lower.includes('unavailable') || lower.includes('high demand')) {
    return new GeminiServiceError(
      'SERVICE_UNAVAILABLE',
      'The AI analysis model is temporarily experiencing high demand. Please retry in a few seconds.',
      503,
    );
  }

  if (status === 404 || lower.includes('not_found')) {
    return new GeminiServiceError(
      'MODEL_ERROR',
      `The configured AI model (${MODEL_NAME}) is unavailable or unsupported.`,
      502,
    );
  }

  if (status === 400 || lower.includes('invalid_argument')) {
    return new GeminiServiceError(
      'UNSUPPORTED_CONTENT',
      'The uploaded file could not be read by the AI analyzer. Please upload a clear PDF, JPG, or PNG.',
      400,
    );
  }

  return new GeminiServiceError(
    'AI_UPSTREAM_ERROR',
    'The AI analysis service encountered a temporary error. Please try again.',
    502,
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('AI_TIMEOUT')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), GEMINI_TIMEOUT_MS);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientError(err)) {
        const delayMs = 800 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const BLOOD_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallStatus: {
      type: Type.STRING,
      description: 'Must be one of: normal, attention, abnormal',
    },
    analysisTitle: {
      type: Type.STRING,
      description: 'Concise descriptive title of the blood report analyzed',
    },
    bloodParameters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          value: { type: Type.STRING },
          unit: { type: Type.STRING },
          referenceRange: { type: Type.STRING },
          status: {
            type: Type.STRING,
            description: 'Must be one of: normal, attention, abnormal',
          },
          explanation: { type: Type.STRING },
        },
        required: ['name', 'value', 'unit', 'referenceRange', 'status', 'explanation'],
      },
    },
    keyObservations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    normalFindings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    abnormalFindings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    simpleExplanation: { type: Type.STRING },
    importantNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    qualityAssessment: {
      type: Type.OBJECT,
      properties: {
        rating: {
          type: Type.STRING,
          description: 'Must be one of: good, fair, limited',
        },
        details: { type: Type.STRING },
      },
      required: ['rating', 'details'],
    },
    limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    finalSummary: { type: Type.STRING },
    urgentCareNotice: { type: Type.STRING },
  },
  required: [
    'overallStatus',
    'analysisTitle',
    'bloodParameters',
    'keyObservations',
    'normalFindings',
    'abnormalFindings',
    'simpleExplanation',
    'importantNotes',
    'qualityAssessment',
    'limitations',
    'finalSummary',
  ],
};

const IMAGING_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallStatus: {
      type: Type.STRING,
      description: 'Must be one of: normal, attention, abnormal',
    },
    analysisTitle: {
      type: Type.STRING,
      description: 'Descriptive educational title for the scan review',
    },
    imagingObservations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          region: { type: Type.STRING },
          observation: { type: Type.STRING },
          status: {
            type: Type.STRING,
            description: 'Must be one of: normal, attention, abnormal',
          },
          confidence: {
            type: Type.STRING,
            description: 'Must be one of: high, moderate, low',
          },
          plainLanguage: { type: Type.STRING },
        },
        required: ['region', 'observation', 'status', 'confidence', 'plainLanguage'],
      },
    },
    keyObservations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    normalFindings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    abnormalFindings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    simpleExplanation: { type: Type.STRING },
    importantNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    qualityAssessment: {
      type: Type.OBJECT,
      properties: {
        rating: {
          type: Type.STRING,
          description: 'Must be one of: good, fair, limited',
        },
        details: { type: Type.STRING },
      },
      required: ['rating', 'details'],
    },
    limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    finalSummary: { type: Type.STRING },
    urgentCareNotice: { type: Type.STRING },
  },
  required: [
    'overallStatus',
    'analysisTitle',
    'imagingObservations',
    'keyObservations',
    'normalFindings',
    'abnormalFindings',
    'simpleExplanation',
    'importantNotes',
    'qualityAssessment',
    'limitations',
    'finalSummary',
  ],
};

function sanitizeSeverity(val: unknown): 'normal' | 'attention' | 'abnormal' {
  if (val === 'normal' || val === 'attention' || val === 'abnormal') return val;
  return 'attention';
}

function sanitizeConfidence(val: unknown): 'high' | 'moderate' | 'low' {
  if (val === 'high' || val === 'moderate' || val === 'low') return val;
  return 'moderate';
}

function sanitizeQualityRating(val: unknown): 'good' | 'fair' | 'limited' {
  if (val === 'good' || val === 'fair' || val === 'limited') return val;
  return 'fair';
}

function parseJsonResponse(rawText: string | undefined): Record<string, unknown> {
  const cleaned = (rawText ?? '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  if (!cleaned) {
    throw new GeminiServiceError(
      'INVALID_AI_RESPONSE',
      'The AI service returned an empty response. Please try again.',
      502,
    );
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new GeminiServiceError(
      'INVALID_AI_RESPONSE',
      'The AI service returned an unreadable response format. Please try again.',
      502,
    );
  }
}

function normalizeResult(raw: Record<string, unknown>): MedicalAnalysisResult {
  const rawQuality = (raw.qualityAssessment ?? {}) as Record<string, unknown>;
  const rawBlood = Array.isArray(raw.bloodParameters) ? raw.bloodParameters : undefined;
  const rawImaging = Array.isArray(raw.imagingObservations) ? raw.imagingObservations : undefined;

  return {
    overallStatus: sanitizeSeverity(raw.overallStatus),
    analysisTitle: String(raw.analysisTitle || 'Medical Report Educational Analysis'),
    keyObservations: Array.isArray(raw.keyObservations) ? raw.keyObservations.map(String) : [],
    normalFindings: Array.isArray(raw.normalFindings) ? raw.normalFindings.map(String) : [],
    abnormalFindings: Array.isArray(raw.abnormalFindings) ? raw.abnormalFindings.map(String) : [],
    simpleExplanation: String(raw.simpleExplanation || ''),
    importantNotes: Array.isArray(raw.importantNotes) ? raw.importantNotes.map(String) : [],
    qualityAssessment: {
      rating: sanitizeQualityRating(rawQuality.rating),
      details: String(rawQuality.details || 'Report legibility and completeness reviewed.'),
    },
    limitations: Array.isArray(raw.limitations) ? raw.limitations.map(String) : [],
    finalSummary: String(raw.finalSummary || ''),
    urgentCareNotice: raw.urgentCareNotice ? String(raw.urgentCareNotice) : undefined,
    bloodParameters: rawBlood?.map((item) => {
      const p = item as Record<string, unknown>;
      return {
        name: String(p.name || 'Parameter'),
        value: String(p.value || 'N/A'),
        unit: String(p.unit || ''),
        referenceRange: String(p.referenceRange || 'See lab sheet'),
        status: sanitizeSeverity(p.status),
        explanation: String(p.explanation || ''),
      };
    }),
    imagingObservations: rawImaging?.map((item) => {
      const o = item as Record<string, unknown>;
      return {
        region: String(o.region || 'Visible Anatomy'),
        observation: String(o.observation || ''),
        status: sanitizeSeverity(o.status),
        confidence: sanitizeConfidence(o.confidence),
        plainLanguage: String(o.plainLanguage || ''),
      };
    }),
  };
}

export async function analyzeBloodReport(params: {
  fileBuffer: Buffer;
  mimeType: string;
  extractedPdfText?: string;
  patientContext: PatientContext;
}): Promise<MedicalAnalysisResult> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new GeminiServiceError(
      'AI_NOT_CONFIGURED',
      'Gemini AI service is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
      503,
    );
  }

  const systemInstruction = `You are MediScan AI, an educational medical laboratory report explainer.
CRITICAL SAFETY RULES:
1. You provide EDUCATIONAL AND INFORMATIONAL explanations only. Never issue a confirmed medical diagnosis or prescribe treatment.
2. Only extract parameters actually present in the uploaded report or extracted text. Do NOT fabricate numbers that are not visible.
3. Explicitly look for key panels when present: Hemoglobin (HB), RBC, WBC, Platelets, Blood Sugar (Fasting/Random Glucose or HbA1c), Cholesterol (Total, LDL, HDL, Triglycerides), Creatinine, Vitamin D, and Vitamin B12, plus any other lab biomarkers printed on the report.
4. Compare each value against the reference range printed on the report, or standard adult laboratory reference ranges if the sheet omits one (note when standard ranges are used).
5. Classify status conservatively:
   - "normal": clearly within reference range
   - "attention": borderline, mildly outside range, or unclear/unreadable unit
   - "abnormal": clearly outside reference range requiring physician review
6. Explain every parameter in warm, clear, beginner-friendly language.
7. If the file is not a medical blood report or is unreadable/blurry, honestly state that in qualityAssessment, limitations, and finalSummary without inventing fake lab data.
8. Include a clear urgentCareNotice ONLY if markedly critical values or concerning symptoms are mentioned; advise seeking prompt medical evaluation.`;

  const contextSummary = [
    `Patient-provided context:`,
    `- Name/Label: ${params.patientContext.patientName || 'Not provided'}`,
    `- Age: ${params.patientContext.patientAge || 'Not provided'}`,
    `- Biological Sex: ${params.patientContext.patientSex || 'Not provided'}`,
    `- Report Date: ${params.patientContext.reportDateLabel || 'Not provided'}`,
    `- Clinical Notes / Symptoms: ${params.patientContext.clinicalNotes || 'None provided'}`,
    params.extractedPdfText?.trim()
      ? `\nExtracted PDF Text:\n${params.extractedPdfText.slice(0, 24000)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const filePart = {
    inlineData: {
      mimeType: params.mimeType,
      data: params.fileBuffer.toString('base64'),
    },
  };

  const textPart = {
    text: `Analyze this uploaded blood test report thoroughly. Extract all measurable laboratory parameters, compare them with reference ranges, classify each as normal/attention/abnormal, explain them in simple everyday language, assess document legibility/quality, state AI limitations, and write a structured summary.\n\n${contextSummary}`,
  };

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts: [filePart, textPart] },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: BLOOD_ANALYSIS_SCHEMA,
        },
      }),
    );

    const parsed = parseJsonResponse(response.text);
    const normalized = normalizeResult(parsed);
    if (!normalized.finalSummary) {
      normalized.finalSummary =
        'Review the extracted blood parameters above with your physician for clinical interpretation.';
    }
    if (normalized.limitations.length === 0) {
      normalized.limitations.push(
        'Educational AI summary only. Verify every extracted value and reference range against your official laboratory report.',
      );
    }
    return normalized;
  } catch (err) {
    const details = extractErrorDetails(err);
    console.error('[Gemini Blood Analysis Failure]', { status: details.status });
    throw mapGeminiError(err);
  }
}

const IMAGING_GUIDANCE: Record<Exclude<SubType, 'blood_panel'>, string> = {
  bone_xray: `Focus on Bone X-ray educational observation:
- Visible bone alignment and anatomical positioning.
- Obvious displaced fractures or gross cortical bone continuity disruptions (clearly state that hairline/occult fractures cannot be ruled out).
- Joint appearance, visible joint spaces, and cortical margins.
- Image limitations (single projection, cropping, exposure, lack of orthogonal views).
- NEVER claim the X-ray is normal simply because no obvious abnormality is seen; always recommend formal radiologist interpretation.`,
  chest_xray: `Focus on Chest X-ray educational observation:
- Visible ribs, clavicles, and thoracic spine alignment.
- Lung fields appearance and symmetry.
- Heart silhouette and mediastinal appearance (noting AP vs PA projection limitations).
- Visible focal opacities, pleural blunting, or abnormalities.
- NEVER claim the X-ray is normal simply because no abnormality is identified, and NEVER rule out fractures, tumors, or infections; recommend formal radiologist interpretation.`,
  brain_mri: `Focus on Brain MRI educational observation:
- Visible brain structures (cerebral hemispheres, ventricles, midline symmetry, sulci, brainstem/cerebellum if in slice).
- Visible signal asymmetries or structural variations.
- Explain in plain language why a single exported MRI image is NOT equivalent to a complete multi-sequence MRI study.
- NEVER claim reliable detection or exclusion of brain lesions, tumors, strokes, or neurological conditions from one image; state that complete MRI studies require clinically validated DICOM processing preserving sequence metadata and neuroradiologist review.`,
  muscle_mri: `Focus on Muscle MRI educational observation:
- Visible skeletal muscle compartments, fascial planes, and symmetry.
- Visible signal brightness/edema patterns or contour irregularities.
- Explain in plain language why a single exported MRI image cannot replace a multi-plane T1/T2/STIR study.
- NEVER claim reliable diagnosis of muscle tears, nerve injuries, or soft-tissue masses from one image; recommend formal musculoskeletal radiologist and DICOM study review.`,
  soft_tissue_mri: `Focus on Soft Tissue MRI educational observation:
- Visible subcutaneous, tendon, ligament, bursa, or soft tissue planes.
- Visible localized fluid signal or contour changes.
- Explain in plain language why one exported MRI slice lacks multi-sequence volumetric context.
- NEVER claim reliable diagnosis of soft-tissue tumors, nerve injuries, or ligament tears from one image; recommend formal radiologist and DICOM study review.`,
};

export async function analyzeMedicalImage(params: {
  fileBuffer: Buffer;
  mimeType: string;
  subType: Exclude<SubType, 'blood_panel'>;
  patientContext: PatientContext;
}): Promise<MedicalAnalysisResult> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new GeminiServiceError(
      'AI_NOT_CONFIGURED',
      'Gemini AI service is not configured. Please add GEMINI_API_KEY in Settings > Secrets.',
      503,
    );
  }

  const modalityLabel = params.subType.includes('xray') ? 'X-ray Radiograph' : 'MRI Scan';
  const systemInstruction = `You are MediScan AI, a cautious, educational medical imaging explainer.
CRITICAL SAFETY & CLINICAL BOUNDARY RULES:
1. You are a general multimodal AI model providing EDUCATIONAL OBSERVATIONS ONLY — NOT a clinically validated radiological diagnostic device.
2. NEVER claim that a scan is definitively normal simply because you do not identify an abnormality. NEVER claim to detect or rule out every fracture, tumor, lesion, nerve injury, infection, or disease.
3. Do NOT present model confidence levels as clinically validated diagnostic probabilities.
4. Recommend formal interpretation by a board-certified radiologist or qualified physician for every scan.
5. If the uploaded image is NOT a medical ${modalityLabel}, or is severely blurred, cropped, dark, or low-resolution, clearly report that in qualityAssessment and limitations without inventing anatomical findings.
6. ${IMAGING_GUIDANCE[params.subType]}
7. Assign conservative observational certainty ("high", "moderate", "low") and status ("normal" for no gross visual irregularity noted on this limited educational view, "attention" for borderline/uncertain/quality-limited areas, "abnormal" for notable visual irregularity needing prompt clinician review).`;

  const contextSummary = [
    `Scan Category: ${params.subType.replace('_', ' ').toUpperCase()}`,
    `Patient-provided context:`,
    `- Name/Label: ${params.patientContext.patientName || 'Not provided'}`,
    `- Age: ${params.patientContext.patientAge || 'Not provided'}`,
    `- Biological Sex: ${params.patientContext.patientSex || 'Not provided'}`,
    `- Scan Date: ${params.patientContext.reportDateLabel || 'Not provided'}`,
    `- Symptoms / Reason for Scan: ${params.patientContext.clinicalNotes || 'None provided'}`,
  ].join('\n');

  const imagePart = {
    inlineData: {
      mimeType: params.mimeType,
      data: params.fileBuffer.toString('base64'),
    },
  };

  const textPart = {
    text: `Examine this uploaded ${modalityLabel} image carefully for educational explanation. Provide structured anatomical observations, normal vs flagged findings, simple-language explanation, image quality evaluation, explicit AI & single-image limitations, precautions, and an overall summary.\n\n${contextSummary}`,
  };

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts: [imagePart, textPart] },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: IMAGING_ANALYSIS_SCHEMA,
        },
      }),
    );

    const parsed = parseJsonResponse(response.text);
    const normalized = normalizeResult(parsed);
    if (!normalized.finalSummary) {
      normalized.finalSummary =
        'Educational visual observations generated. Formal interpretation by a board-certified radiologist is required.';
    }
    if (normalized.limitations.length === 0) {
      normalized.limitations.push(
        'General-purpose AI vision observations cannot rule out fractures, lesions, infections, or other medical conditions. Always obtain formal radiologist review.',
      );
    }
    return normalized;
  } catch (err) {
    const details = extractErrorDetails(err);
    console.error(`[Gemini Imaging Analysis Failure:${params.subType}]`, { status: details.status });
    throw mapGeminiError(err);
  }
}
