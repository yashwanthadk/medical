import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../lib/authToken';
import { extractTextFromPdfFile, inspectImageQuality } from '../lib/pdfReport';
import type { ModuleType, SubType } from '../types/medical';

interface AnalyzePageProps {
  mode: ModuleType;
  onNavigate: (path: string) => void;
}

const MAX_BYTES = 15 * 1024 * 1024;

export function AnalyzePage({ mode, onNavigate }: AnalyzePageProps) {
  const { user } = useAuth();
  const [subType, setSubType] = useState<SubType>(() => {
    if (mode === 'blood') return 'blood_panel';
    if (mode === 'xray') return 'bone_xray';
    return 'brain_mri';
  });

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfExtract, setPdfExtract] = useState<{ text: string; pageCount: number } | null>(null);
  const [qualityCheck, setQualityCheck] = useState<{
    note: string;
    isWarning: boolean;
  } | null>(null);

  const [patientName, setPatientName] = useState(user?.fullName || '');
  const [patientAge, setPatientAge] = useState('');
  const [patientSex, setPatientSex] = useState('');
  const [reportDateLabel, setReportDateLabel] = useState(new Date().toISOString().slice(0, 10));
  const [clinicalNotes, setClinicalNotes] = useState('');

  const [validationError, setValidationError] = useState('');
  const [serverError, setServerError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [stageLabel, setStageLabel] = useState('');

  useEffect(() => {
    if (mode === 'blood') setSubType('blood_panel');
    else if (mode === 'xray') setSubType('bone_xray');
    else setSubType('brain_mri');

    setFile(null);
    setPreviewUrl(null);
    setPdfExtract(null);
    setQualityCheck(null);
    setValidationError('');
    setServerError('');
  }, [mode]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const acceptedTypes =
    mode === 'blood'
      ? ['application/pdf', 'image/jpeg', 'image/png']
      : ['image/jpeg', 'image/png'];

  const acceptAttr =
    mode === 'blood' ? '.pdf,.jpg,.jpeg,.png' : '.jpg,.jpeg,.png';

  const handleFileChange = async (selected: File | null) => {
    setValidationError('');
    setServerError('');
    setPdfExtract(null);
    setQualityCheck(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!selected) {
      setFile(null);
      return;
    }

    const lower = selected.name.toLowerCase();
    const validExt =
      mode === 'blood'
        ? /\.(pdf|jpe?g|png)$/.test(lower)
        : /\.(jpe?g|png)$/.test(lower);

    if (!acceptedTypes.includes(selected.type) && !validExt) {
      setValidationError(
        mode === 'blood'
          ? 'Unsupported file type. Blood Report Analysis accepts PDF, JPG, JPEG, and PNG files.'
          : 'Unsupported file type. Medical imaging analysis accepts JPG, JPEG, and PNG images.',
      );
      setFile(null);
      return;
    }

    if (selected.size > MAX_BYTES) {
      setValidationError('File size exceeds the 15 MB upload limit.');
      setFile(null);
      return;
    }

    if (selected.size < 1024) {
      setValidationError('File appears empty or too small to contain readable medical data.');
      setFile(null);
      return;
    }

    setFile(selected);

    if (selected.type === 'application/pdf' || lower.endsWith('.pdf')) {
      const extracted = await extractTextFromPdfFile(selected);
      setPdfExtract(extracted);
      setQualityCheck({
        note:
          extracted.text.length > 40
            ? `PDF validated (${extracted.pageCount} page${extracted.pageCount === 1 ? '' : 's'}). Selectable lab text detected for extraction.`
            : `Scanned PDF detected (${extracted.pageCount || 1} page). Multimodal OCR vision will inspect the document directly.`,
        isWarning: extracted.text.length <= 40,
      });
    } else {
      const objUrl = URL.createObjectURL(selected);
      setPreviewUrl(objUrl);
      const imgInfo = await inspectImageQuality(selected);
      setQualityCheck({
        note: imgInfo.qualityNote,
        isWarning: imgInfo.isLowRes,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setValidationError('Please select a file before starting analysis.');
      return;
    }

    setAnalyzing(true);
    setServerError('');
    setStageLabel('Validating and encrypting file...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    let stageTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subType', subType);
      formData.append('patientName', patientName);
      formData.append('patientAge', patientAge);
      formData.append('patientSex', patientSex);
      formData.append('reportDateLabel', reportDateLabel);
      formData.append('clinicalNotes', clinicalNotes);
      if (pdfExtract?.text) {
        formData.append('extractedPdfText', pdfExtract.text);
      }

      stageTimer = setTimeout(() => {
        setStageLabel('Running structured AI analysis & clinical safety checks...');
      }, 900);

      const endpoint =
        mode === 'blood'
          ? '/api/analyze/blood'
          : mode === 'xray'
            ? '/api/analyze/xray'
            : '/api/analyze/mri';

      // Do NOT set Content-Type manually so browser attaches multipart boundary automatically
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: formData,
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const rawText = await res.text().catch(() => '');
        console.error('Unexpected non-JSON server response:', res.status, rawText.slice(0, 300));
        if (res.status === 413) {
          setServerError('Uploaded file is too large for the server limit (15 MB maximum).');
        } else if (res.status === 502 || res.status === 503 || res.status === 504) {
          setServerError('Backend server or AI gateway is temporarily unavailable. Please try again in a few seconds.');
        } else {
          setServerError(`Invalid server response (HTTP ${res.status}). Please try again.`);
        }
        return;
      }

      const data = (await res.json()) as {
        reportId?: string;
        error?: string;
        code?: string;
      };

      if (!res.ok || !data.reportId) {
        if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
          setServerError('Your session expired. Please sign in again and retry the upload.');
        } else {
          setServerError(
            data.error || `Analysis failed (HTTP ${res.status}). Please verify the uploaded file and try again.`,
          );
        }
        return;
      }

      onNavigate(`/reports/${data.reportId}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setServerError('Analysis request timed out after 90 seconds. Please try again with a clearer or smaller file.');
      } else if (err instanceof TypeError) {
        setServerError('Backend server unavailable or connection interrupted. Please verify the app server is running and try again.');
      } else {
        setServerError(
          err instanceof Error && err.message
            ? `Upload failed: ${err.message}`
            : 'Unexpected error during analysis upload. Please try again.',
        );
      }
    } finally {
      clearTimeout(timeoutId);
      if (stageTimer) clearTimeout(stageTimer);
      setAnalyzing(false);
      setStageLabel('');
    }
  };

  const moduleMeta = {
    blood: {
      title: 'Blood Report Analysis',
      breadcrumb: 'Blood Report Analysis',
      subtitle:
        'Upload your laboratory blood test report in PDF, JPG, JPEG, or PNG format. MediScan AI extracts key markers (Hemoglobin, RBC, WBC, Platelets, Blood Sugar, Cholesterol, Creatinine, Vitamin D, Vitamin B12) and explains them against reference ranges.',
    },
    xray: {
      title: 'X-ray Analysis — Bones & Chest',
      breadcrumb: 'X-ray Analysis',
      subtitle:
        'Select Bone X-ray or Chest X-ray and upload a JPG, JPEG, or PNG radiograph to receive structured educational observations, image-quality notes, and radiologist review guidance.',
    },
    mri: {
      title: 'MRI Scan Analysis — Brain, Muscles & Soft Tissues',
      breadcrumb: 'MRI Scan Analysis',
      subtitle:
        'Choose Brain, Muscle, or Soft Tissue MRI and upload a JPG, JPEG, or PNG scan slice to review visible anatomical structures in plain language along with single-image limitations.',
    },
  }[mode];

  return (
    <WorkspaceLayout
      currentPath={`/analyze/${mode}`}
      breadcrumb={moduleMeta.breadcrumb}
      onNavigate={onNavigate}
    >
      <div className="space-y-8">
        {/* Header + Module Switcher */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 p-1 bg-slate-100 rounded-lg w-fit">
            {[
              { id: 'blood', label: 'Blood Report', path: '/analyze/blood' },
              { id: 'xray', label: 'X-ray Scan', path: '/analyze/xray' },
              { id: 'mri', label: 'MRI Scan', path: '/analyze/mri' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.path)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 max-w-3xl">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {moduleMeta.title}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">{moduleMeta.subtitle}</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            { num: '01', label: 'Select Category & File', done: Boolean(file) },
            { num: '02', label: 'Validate Quality', done: Boolean(qualityCheck) },
            { num: '03', label: 'Add Patient Context', done: Boolean(file) },
            { num: '04', label: 'AI Review & PDF', done: false },
          ].map((st) => (
            <div
              key={st.num}
              className={`px-3.5 py-2.5 rounded-lg border ${
                st.done ? 'bg-teal-50/60 border-teal-200 text-teal-900' : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <span className="font-mono font-semibold mr-2">{st.num}.</span>
              <span className="font-medium">{st.label}</span>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Category + Upload + Validation Preview */}
          <div className="lg:col-span-7 space-y-6">
            {mode === 'xray' && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <p className="text-sm font-semibold text-slate-900">Select X-ray Category</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      value: 'bone_xray' as const,
                      title: 'Bone X-ray Analysis',
                      desc: 'Fracture lines, bone alignment, joint margins & osseous features',
                    },
                    {
                      value: 'chest_xray' as const,
                      title: 'Chest X-ray Analysis',
                      desc: 'Lung appearance, cardiac silhouette, fluid or infection signs',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSubType(opt.value)}
                      className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                        subType === opt.value
                          ? 'border-teal-600 bg-teal-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{opt.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'mri' && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <p className="text-sm font-semibold text-slate-900">Select MRI Scan Category</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      value: 'brain_mri' as const,
                      title: 'Brain MRI',
                      desc: 'Visible brain structures, ventricles & asymmetries',
                    },
                    {
                      value: 'muscle_mri' as const,
                      title: 'Muscle MRI',
                      desc: 'Muscle compartments, strain or edema patterns',
                    },
                    {
                      value: 'soft_tissue_mri' as const,
                      title: 'Soft Tissue MRI',
                      desc: 'Tendons, ligaments, fascia & fluid collections',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSubType(opt.value)}
                      className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                        subType === opt.value
                          ? 'border-teal-600 bg-teal-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{opt.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* File Dropzone */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Upload Medical File</p>
                <span className="text-xs text-slate-500">
                  {mode === 'blood' ? 'PDF, JPG, JPEG, PNG · Max 15 MB' : 'JPG, JPEG, PNG · Max 15 MB'}
                </span>
              </div>

              <label
                htmlFor="medical-file-input"
                className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-teal-600 hover:bg-slate-50/60 transition-colors cursor-pointer"
              >
                <UploadCloud className="w-8 h-8 text-teal-700 mb-3" />
                <p className="text-sm font-semibold text-slate-900">
                  {file ? file.name : 'Click to choose file from your device'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB · Click to replace`
                    : 'Files are encrypted with AES-256-GCM before storage'}
                </p>
                <input
                  id="medical-file-input"
                  type="file"
                  accept={acceptAttr}
                  className="sr-only"
                  onChange={(e) => void handleFileChange(e.target.files?.[0] || null)}
                />
              </label>

              {validationError && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-sm text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{validationError}</span>
                </div>
              )}

              {qualityCheck && (
                <div
                  className={`p-3.5 rounded-lg border flex items-start gap-2.5 text-sm ${
                    qualityCheck.isWarning
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  {qualityCheck.isWarning ? (
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{qualityCheck.note}</span>
                </div>
              )}

              {/* Live File Preview */}
              {previewUrl && (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-950">
                  <img
                    src={previewUrl}
                    alt="Uploaded medical scan preview"
                    className="w-full max-h-80 object-contain mx-auto"
                  />
                </div>
              )}

              {pdfExtract && (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <FileText className="w-4 h-4 text-teal-700" />
                    <span>PDF Text Extraction Preview</span>
                  </div>
                  <p className="text-xs font-mono text-slate-600 line-clamp-5 whitespace-pre-wrap">
                    {pdfExtract.text || 'No embedded text layer found — document pages will be inspected visually by AI OCR.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Patient Details & Submit */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Patient-Provided Details
                </h2>
                <p className="text-xs text-slate-500">
                  Included in your final medical summary report PDF.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pt-name" className="block text-xs font-medium text-slate-700">
                  Patient Name / Label
                </label>
                <input
                  id="pt-name"
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="pt-age" className="block text-xs font-medium text-slate-700">
                    Age (Optional)
                  </label>
                  <input
                    id="pt-age"
                    type="text"
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    placeholder="e.g. 34"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="pt-sex" className="block text-xs font-medium text-slate-700">
                    Biological Sex (Optional)
                  </label>
                  <select
                    id="pt-sex"
                    value={patientSex}
                    onChange={(e) => setPatientSex(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="">Prefer not to say</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pt-date" className="block text-xs font-medium text-slate-700">
                  Report / Scan Date
                </label>
                <input
                  id="pt-date"
                  type="date"
                  value={reportDateLabel}
                  onChange={(e) => setReportDateLabel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pt-notes" className="block text-xs font-medium text-slate-700">
                  Symptoms or Reason for Test (Optional)
                </label>
                <textarea
                  id="pt-notes"
                  rows={3}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="e.g., Routine annual blood panel, or persistent knee soreness after running"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {mode === 'mri' && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  <strong>Single-Image MRI Note:</strong> Full clinical MRI studies contain dozens of multi-sequence slices (T1, T2, FLAIR, STIR). Uploading one image provides educational structure context only and cannot replace a full DICOM radiologist read.
                </div>
              )}

              {serverError && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                disabled={analyzing || !file}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{stageLabel || 'Analyzing...'}</span>
                  </>
                ) : (
                  <span>Run Educational AI Analysis</span>
                )}
              </button>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3 text-xs text-amber-950 leading-relaxed">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-800" />
              <span>
                Educational use only. Results are not a medical diagnosis. Always review findings with a licensed physician or radiologist.
              </span>
            </div>
          </div>
        </form>
      </div>
    </WorkspaceLayout>
  );
}
