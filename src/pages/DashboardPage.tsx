import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Brain,
  Download,
  Droplets,
  Eye,
  MailCheck,
  Plus,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../lib/authToken';
import { downloadMedicalSummaryPdf, formatSubTypeLabel } from '../lib/pdfReport';
import type { MedicalReportRecord, MedicalReportSummary } from '../types/medical';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { user, setUser } = useAuth();
  const [reports, setReports] = useState<MedicalReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadReports() {
      try {
        const res = await fetch('/api/reports', {
          credentials: 'include',
          headers: authHeaders(),
        });
        if (!res.ok) {
          throw new Error('Failed to load reports');
        }
        const data = (await res.json()) as { reports: MedicalReportSummary[] };
        if (active) setReports(data.reports);
      } catch {
        if (active) setError('Could not load your medical report history.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadReports();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const blood = reports.filter((r) => r.moduleType === 'blood').length;
    const xray = reports.filter((r) => r.moduleType === 'xray').length;
    const mri = reports.filter((r) => r.moduleType === 'mri').length;
    const normal = reports.filter((r) => r.status === 'normal').length;
    const attention = reports.filter((r) => r.status === 'attention').length;
    const abnormal = reports.filter((r) => r.status === 'abnormal').length;
    return { total: reports.length, blood, xray, mri, normal, attention, abnormal };
  }, [reports]);

  const handleVerifyEmail = async () => {
    setVerifyingEmail(true);
    setVerifyNotice('');
    try {
      const resendRes = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      });
      const resendData = (await resendRes.json()) as { verificationToken?: string };
      if (resendData.verificationToken) {
        const verifyRes = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token: resendData.verificationToken }),
        });
        const verifyData = (await verifyRes.json()) as { user?: typeof user };
        if (verifyRes.ok && verifyData.user) {
          setUser(verifyData.user);
          setVerifyNotice('Email address verified.');
        }
      }
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleDownloadPdf = async (reportId: string) => {
    setDownloadingId(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { report: MedicalReportRecord };
      downloadMedicalSummaryPdf(data.report);
    } finally {
      setDownloadingId(null);
    }
  };

  const maxModuleCount = Math.max(1, stats.blood, stats.xray, stats.mri);

  return (
    <WorkspaceLayout currentPath="/dashboard" breadcrumb="Dashboard" onNavigate={onNavigate}>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Welcome back, {user?.fullName}
            </h1>
            <p className="text-sm text-slate-600">
              Manage your uploaded medical reports, inspect plain-language AI explanations, and download summary PDFs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/analyze/blood')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer w-fit"
          >
            <Plus className="w-4 h-4" />
            <span>Upload New Report</span>
          </button>
        </div>

        {/* Email Verification Reminder if Unverified */}
        {user && !user.emailVerified && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <MailCheck className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-950">
                <p className="font-semibold">Email verification pending</p>
                <p className="text-amber-900/90">
                  Verify <span className="font-medium">{user.email}</span> to confirm account recovery ownership.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={verifyingEmail}
              onClick={handleVerifyEmail}
              className="px-3.5 py-2 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {verifyingEmail ? 'Verifying...' : 'Verify Email Now'}
            </button>
          </div>
        )}

        {verifyNotice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {verifyNotice}
          </div>
        )}

        {/* 4-Column Metric Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Total Reports Analyzed</p>
            <p className="font-display text-3xl font-bold text-slate-900 tabular-nums">{stats.total}</p>
            <p className="text-xs text-slate-500">Encrypted in personal vault</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">Blood Report Analyses</p>
            <p className="font-display text-3xl font-bold text-slate-900 tabular-nums">{stats.blood}</p>
            <p className="text-xs text-slate-500">CBC, lipids, glucose &amp; vitamins</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">X-ray Analyses</p>
            <p className="font-display text-3xl font-bold text-slate-900 tabular-nums">{stats.xray}</p>
            <p className="text-xs text-slate-500">Bone &amp; chest radiographs</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1">
            <p className="text-xs font-medium text-slate-500">MRI Scan Analyses</p>
            <p className="font-display text-3xl font-bold text-slate-900 tabular-nums">{stats.mri}</p>
            <p className="text-xs text-slate-500">Brain, muscle &amp; soft tissue</p>
          </div>
        </section>

        {/* Quick Analysis Launchers */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <button
            type="button"
            onClick={() => onNavigate('/analyze/blood')}
            className="text-left bg-white border border-slate-200 rounded-xl p-6 hover:border-teal-500 transition-colors group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <Droplets className="w-5 h-5 text-teal-700" aria-hidden="true" />
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-700 transition-colors" />
            </div>
            <h2 className="font-display text-base font-bold text-slate-900">Blood Report Analysis</h2>
            <p className="mt-1 text-sm text-slate-600">
              Upload PDF, JPG, or PNG lab sheets for parameter extraction and range explanations.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/analyze/xray')}
            className="text-left bg-white border border-slate-200 rounded-xl p-6 hover:border-teal-500 transition-colors group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <Activity className="w-5 h-5 text-sky-700" aria-hidden="true" />
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-700 transition-colors" />
            </div>
            <h2 className="font-display text-base font-bold text-slate-900">X-ray Analysis</h2>
            <p className="mt-1 text-sm text-slate-600">
              Review Bone or Chest X-ray images for visible features and quality notes.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/analyze/mri')}
            className="text-left bg-white border border-slate-200 rounded-xl p-6 hover:border-teal-500 transition-colors group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <Brain className="w-5 h-5 text-teal-700" aria-hidden="true" />
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-700 transition-colors" />
            </div>
            <h2 className="font-display text-base font-bold text-slate-900">MRI Scan Analysis</h2>
            <p className="mt-1 text-sm text-slate-600">
              Inspect Brain, Muscle, or Soft Tissue MRI slices with single-image safety guidance.
            </p>
          </button>
        </section>

        {/* Charts Row */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Analysis Volume by Module
                </h2>
                <p className="text-xs text-slate-500">Breakdown across your saved medical records</p>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                Total: {stats.total}
              </span>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Blood Reports', count: stats.blood, color: 'bg-teal-600' },
                { label: 'X-ray Scans', count: stats.xray, color: 'bg-sky-600' },
                { label: 'MRI Scans', count: stats.mri, color: 'bg-slate-700' },
              ].map((bar) => {
                const widthPct = stats.total === 0 ? 0 : Math.round((bar.count / maxModuleCount) * 100);
                return (
                  <div key={bar.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{bar.label}</span>
                      <span className="font-mono text-slate-900 tabular-nums">{bar.count}</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${bar.color} rounded-full transition-all duration-300`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Report Status Summary
              </h2>
              <p className="text-xs text-slate-500">Educational classification across completed analyses</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <StatusBadge status="normal" compact />
                <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {stats.normal}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <StatusBadge status="attention" compact />
                <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {stats.attention}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <StatusBadge status="abnormal" compact />
                <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {stats.abnormal}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Analysis Reports Table */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">Recent Analysis Reports</h2>
              <p className="text-xs text-slate-500">View plain-language explanations or export summary PDFs</p>
            </div>
            {reports.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('/history')}
                className="text-sm font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap cursor-pointer"
              >
                View All History
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-11 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-red-700">{error}</div>
          ) : reports.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900">No medical reports uploaded yet</p>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Upload a blood test report, X-ray image, or MRI scan to see structured educational findings and download your summary PDF.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('/analyze/blood')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Analyze First Report</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 px-6">Report / File</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {reports.slice(0, 6).map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-6">
                        <p className="font-medium text-slate-900 truncate max-w-[240px]">
                          {report.analysisTitle}
                        </p>
                        <p className="text-xs text-slate-500 truncate max-w-[240px]">
                          {report.fileName} · {report.patientName}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                        {formatSubTypeLabel(report.subType)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {new Date(report.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={report.status} compact />
                      </td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => onNavigate(`/reports/${report.id}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          disabled={downloadingId === report.id}
                          onClick={() => handleDownloadPdf(report.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{downloadingId === report.id ? '...' : 'PDF'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </WorkspaceLayout>
  );
}
