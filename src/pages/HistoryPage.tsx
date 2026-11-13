import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { authHeaders } from '../lib/authToken';
import { downloadMedicalSummaryPdf, formatSubTypeLabel } from '../lib/pdfReport';
import type { FindingSeverity, MedicalReportRecord, MedicalReportSummary, ModuleType } from '../types/medical';

interface HistoryPageProps {
  onNavigate: (path: string) => void;
}

export function HistoryPage({ onNavigate }: HistoryPageProps) {
  const [reports, setReports] = useState<MedicalReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<'all' | ModuleType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | FindingSeverity>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/reports', {
          credentials: 'include',
          headers: authHeaders(),
        });
        if (res.ok && active) {
          const data = (await res.json()) as { reports: MedicalReportSummary[] };
          setReports(data.reports);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (moduleFilter !== 'all' && r.moduleType !== moduleFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.analysisTitle.toLowerCase().includes(q) ||
        r.fileName.toLowerCase().includes(q) ||
        r.patientName.toLowerCase().includes(q) ||
        r.finalSummary.toLowerCase().includes(q)
      );
    });
  }, [reports, search, moduleFilter, statusFilter]);

  const handleDownloadPdf = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { report: MedicalReportRecord };
      downloadMedicalSummaryPdf(data.report);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <WorkspaceLayout currentPath="/history" breadcrumb="Report History" onNavigate={onNavigate}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Medical Report History
            </h1>
            <p className="text-sm text-slate-600">
              Search, filter, download PDFs, or permanently remove any report from your private vault.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/analyze/blood')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0 cursor-pointer w-fit"
          >
            <Plus className="w-4 h-4" />
            <span>New Analysis</span>
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by file name, patient, or summary..."
              className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'All Types' },
                  { id: 'blood', label: 'Blood' },
                  { id: 'xray', label: 'X-ray' },
                  { id: 'mri', label: 'MRI' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModuleFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    moduleFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | FindingSeverity)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="all">All Statuses</option>
              <option value="normal">Within Range</option>
              <option value="attention">Needs Review</option>
              <option value="abnormal">Abnormal Finding</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">
                {reports.length === 0 ? 'No saved reports yet' : 'No matching reports found'}
              </p>
              <p className="text-sm text-slate-500">
                {reports.length === 0
                  ? 'Upload your first blood report, X-ray, or MRI image to get started.'
                  : 'Adjust your search query or filter selections.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 px-6">Title &amp; File</th>
                    <th className="py-3 px-4">Module</th>
                    <th className="py-3 px-4">Analyzed</th>
                    <th className="py-3 px-4">Indicator</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-6">
                        <p className="font-medium text-slate-900 truncate max-w-[260px]">
                          {r.analysisTitle}
                        </p>
                        <p className="text-xs text-slate-500 truncate max-w-[260px]">
                          {r.fileName} · {r.patientName}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                        {formatSubTypeLabel(r.subType)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={r.status} compact />
                      </td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => onNavigate(`/reports/${r.id}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => handleDownloadPdf(r.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => handleDelete(r.id)}
                          aria-label={`Delete ${r.fileName}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
