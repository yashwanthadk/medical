import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Info,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { authHeaders } from '../lib/authToken';
import { downloadMedicalSummaryPdf, formatSubTypeLabel } from '../lib/pdfReport';
import type { MedicalReportRecord } from '../types/medical';

interface ReportResultsPageProps {
  reportId: string;
  onNavigate: (path: string) => void;
}

export function ReportResultsPage({ reportId, onNavigate }: ReportResultsPageProps) {
  const [report, setReport] = useState<MedicalReportRecord | null>(null);
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    let createdBlobUrl: string | null = null;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/reports/${reportId}`, {
          credentials: 'include',
          headers: authHeaders(),
        });
        if (!res.ok) {
          throw new Error('Report not found or access denied.');
        }
        const data = (await res.json()) as { report: MedicalReportRecord };
        if (!active) return;
        setReport(data.report);

        const fileRes = await fetch(`/api/reports/${reportId}/file`, {
          credentials: 'include',
          headers: authHeaders(),
        });
        if (fileRes.ok && active) {
          const blob = await fileRes.blob();
          createdBlobUrl = URL.createObjectURL(blob);
          setFileObjectUrl(createdBlobUrl);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load analysis report.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
      if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
    };
  }, [reportId]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (res.ok) {
        onNavigate('/history');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <WorkspaceLayout
      currentPath={`/reports/${reportId}`}
      breadcrumb={report ? report.analysis.analysisTitle : 'Analysis Results'}
      onNavigate={onNavigate}
    >
      {loading ? (
        <div className="space-y-4">
          <div className="h-10 w-64 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      ) : error || !report ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <p className="text-base font-semibold text-red-700">{error || 'Report unavailable'}</p>
          <button
            type="button"
            onClick={() => onNavigate('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Top Action Header */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-slate-200">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onNavigate('/history')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Report History</span>
              </button>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {report.analysis.analysisTitle}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{formatSubTypeLabel(report.subType)}</span>
                <span aria-hidden="true">·</span>
                <span>{report.fileName}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Analyzed {new Date(report.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => downloadMedicalSummaryPdf(report)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF Report</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {confirmDelete && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-sm text-red-900">
                Permanently delete this medical report and shred its encrypted file from your vault?
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 cursor-pointer"
                >
                  {deleting ? 'Deleting...' : 'Confirm Permanent Delete'}
                </button>
              </div>
            </div>
          )}

          {/* Non-diagnostic status indicator + Urgent Care Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">Educational Review Indicator</p>
                <StatusBadge status={report.analysis.overallStatus} />
              </div>
              <div className="text-xs text-slate-500">
                Patient: <span className="font-medium text-slate-900">{report.patientName}</span>
                {report.patientAge ? ` · Age ${report.patientAge}` : ''}
                {report.patientSex ? ` · ${report.patientSex}` : ''}
              </div>
            </div>

            {report.analysis.urgentCareNotice && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3 text-sm text-red-900">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-700" />
                <div>
                  <p className="font-semibold">Prompt Medical Care Advisory</p>
                  <p className="mt-0.5">{report.analysis.urgentCareNotice}</p>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Note: Status indicators (Green / Yellow / Red) highlight how values or visual observations relate to standard references for educational clarity. They are not a confirmed clinical diagnosis.
            </p>
          </div>

          {/* Preview + Final Summary Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Uploaded File Preview */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Uploaded File Preview</span>
                <span className="text-xs font-mono text-slate-500">
                  {(report.fileSize / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="p-4 flex-1 flex items-center justify-center bg-slate-50 min-h-[260px]">
                {!fileObjectUrl ? (
                  <p className="text-xs text-slate-500">Decrypting file preview...</p>
                ) : report.mimeType === 'application/pdf' ? (
                  <div className="w-full space-y-3">
                    <object
                      data={fileObjectUrl}
                      type="application/pdf"
                      className="w-full h-80 rounded-lg border border-slate-200 bg-white"
                    >
                      <div className="p-6 text-center space-y-2">
                        <FileText className="w-8 h-8 text-teal-700 mx-auto" />
                        <p className="text-sm font-medium text-slate-900">{report.fileName}</p>
                      </div>
                    </object>
                    <a
                      href={fileObjectUrl}
                      download={report.fileName}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Original Encrypted PDF</span>
                    </a>
                  </div>
                ) : (
                  <img
                    src={fileObjectUrl}
                    alt={`Uploaded ${report.fileName}`}
                    className="max-h-96 w-full object-contain rounded-lg bg-slate-950"
                  />
                )}
              </div>
            </div>

            {/* Final Summary & Simple-Language Explanation */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="space-y-2">
                <h2 className="font-display text-lg font-bold text-slate-900">Final Summary</h2>
                <p className="text-sm text-slate-700 leading-relaxed">{report.analysis.finalSummary}</p>
              </div>

              <div className="pt-5 border-t border-slate-200 space-y-2">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Explanation in Simple Language
                </h2>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {report.analysis.simpleExplanation}
                </p>
              </div>

              <div className="pt-5 border-t border-slate-200 space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Image or Report Quality</h3>
                <div className="flex items-start gap-2.5 text-sm text-slate-700">
                  <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold capitalize">
                      {report.analysis.qualityAssessment.rating} quality:{' '}
                    </span>
                    <span>{report.analysis.qualityAssessment.details}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Blood Parameters Table (when blood report) */}
          {report.analysis.bloodParameters && report.analysis.bloodParameters.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Extracted Blood Parameters &amp; Reference Ranges
                </h2>
                <p className="text-xs text-slate-500">
                  Measured values compared with lab or adult reference intervals
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                      <th className="py-3 px-6">Parameter</th>
                      <th className="py-3 px-4">Measured Value</th>
                      <th className="py-3 px-4">Reference Range</th>
                      <th className="py-3 px-4">Indicator</th>
                      <th className="py-3 px-6">Plain-Language Meaning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {report.analysis.bloodParameters.map((param, idx) => (
                      <tr key={`${param.name}-${idx}`} className="align-top">
                        <td className="py-3.5 px-6 font-semibold text-slate-900 whitespace-nowrap">
                          {param.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-900 tabular-nums whitespace-nowrap">
                          {param.value} {param.unit}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {param.referenceRange}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={param.status} compact />
                        </td>
                        <td className="py-3.5 px-6 text-slate-600 leading-relaxed min-w-[260px]">
                          {param.explanation}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Imaging Observations (when X-ray or MRI) */}
          {report.analysis.imagingObservations && report.analysis.imagingObservations.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Visible Anatomical Observations
                </h2>
                <p className="text-xs text-slate-500">
                  Educational AI visual observations with model confidence — verify with a radiologist
                </p>
              </div>
              <div className="divide-y divide-slate-200">
                {report.analysis.imagingObservations.map((obs, idx) => (
                  <div key={`${obs.region}-${idx}`} className="p-6 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-slate-900">{obs.region}</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 capitalize">
                          Confidence: <span className="font-medium text-slate-800">{obs.confidence}</span>
                        </span>
                        <StatusBadge status={obs.status} compact />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{obs.observation}</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{obs.plainLanguage}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Key Observations, Normal Findings, Abnormal Findings */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-900">Key Observations</h2>
              <ul className="space-y-2 text-sm text-slate-700">
                {report.analysis.keyObservations.length === 0 ? (
                  <li className="text-slate-500">No extra observations noted.</li>
                ) : (
                  report.analysis.keyObservations.map((item, i) => (
                    <li key={i} className="leading-relaxed">
                      • {item}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <h2 className="font-display text-base font-bold text-slate-900">Normal Findings</h2>
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                {report.analysis.normalFindings.length === 0 ? (
                  <li className="text-slate-500">No specific normal findings listed.</li>
                ) : (
                  report.analysis.normalFindings.map((item, i) => (
                    <li key={i} className="leading-relaxed">
                      • {item}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Abnormal or Flagged Findings
                </h2>
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                {report.analysis.abnormalFindings.length === 0 ? (
                  <li className="text-slate-500">No abnormal findings flagged in this review.</li>
                ) : (
                  report.analysis.abnormalFindings.map((item, i) => (
                    <li key={i} className="leading-relaxed">
                      • {item}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>

          {/* Important Notes & Limitations of AI Analysis */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="font-display text-base font-bold text-slate-900">
                Important Notes &amp; Precautions
              </h2>
              <ul className="space-y-2 text-sm text-slate-700">
                {report.analysis.importantNotes.map((note, i) => (
                  <li key={i} className="leading-relaxed">
                    • {note}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2 text-amber-900">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <h2 className="font-display text-base font-bold">Limitations of AI Analysis</h2>
              </div>
              <ul className="space-y-2 text-sm text-amber-950/90">
                {report.analysis.limitations.map((lim, i) => (
                  <li key={i} className="leading-relaxed">
                    • {lim}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
    </WorkspaceLayout>
  );
}
