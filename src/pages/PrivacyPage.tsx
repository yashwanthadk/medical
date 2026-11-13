import { Lock, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { PublicFooter, PublicHeader } from '../components/PublicHeader';
import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';

interface PrivacyPageProps {
  onNavigate: (path: string) => void;
}

export function PrivacyPage({ onNavigate }: PrivacyPageProps) {
  const { user } = useAuth();

  const Content = (
    <div className="space-y-10 max-w-4xl">
      <div className="space-y-2">
        <p className="text-sm font-medium text-teal-700">Privacy &amp; Data Protection</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
          How MediScan AI Protects Your Medical Records
        </h1>
        <p className="text-base text-slate-600 leading-relaxed">
          Medical reports and diagnostic images are deeply personal. Here is exactly how your files are validated, encrypted, stored, processed, and deleted.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <Lock className="w-5 h-5 text-teal-700" />
          <h2 className="font-display text-base font-bold text-slate-900">
            Encryption in Transit &amp; at Rest
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            All requests are transmitted over HTTPS. Every uploaded blood report PDF, X-ray image, or MRI scan is encrypted server-side using AES-256-GCM with a unique initialization vector before being written to private vault storage.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <ShieldCheck className="w-5 h-5 text-teal-700" />
          <h2 className="font-display text-base font-bold text-slate-900">
            Strict Per-User Access Isolation
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Passwords are salted and hashed using <code className="font-mono text-xs">scrypt</code>—never stored as plain text. Sessions use signed <code className="font-mono text-xs">HttpOnly</code> cookies, and every report query and file stream verifies that the authenticated user owns the requested record.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <ShieldAlert className="w-5 h-5 text-teal-700" />
          <h2 className="font-display text-base font-bold text-slate-900">
            Server-Side AI &amp; Zero Key Exposure
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            All AI analysis calls run strictly on our backend server. API credentials are never sent to browser code, and your medical documents are never shared with advertising networks or third-party data brokers.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <Trash2 className="w-5 h-5 text-teal-700" />
          <h2 className="font-display text-base font-bold text-slate-900">
            Instant Report &amp; Account Deletion
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            You can delete individual analysis reports at any time from your Report History or Results view. Deleting your account from your Profile cascades immediately, removing all database records and unlinking every encrypted file from vault storage.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-7 space-y-3">
        <h2 className="font-display text-lg font-bold text-amber-950">
          Medical Safety &amp; Educational Scope Policy
        </h2>
        <p className="text-sm text-amber-950/90 leading-relaxed">
          MediScan AI provides educational explanations only. It is not a medical device, does not establish a doctor-patient relationship, and does not provide medical diagnoses, prescriptions, or clinical treatment plans. General multimodal AI models have inherent limitations—particularly when viewing single 2D X-ray or MRI images—and cannot rule out fractures, tumors, infections, or systemic diseases.
        </p>
        <p className="text-sm text-amber-950/90 leading-relaxed">
          Always share original laboratory documents and imaging studies with a qualified physician or radiologist. If you are experiencing severe pain, chest discomfort, difficulty breathing, sudden neurological symptoms, or any medical emergency, seek immediate emergency medical care.
        </p>
      </section>
    </div>
  );

  if (user) {
    return (
      <WorkspaceLayout currentPath="/privacy" breadcrumb="Privacy & Security" onNavigate={onNavigate}>
        {Content}
      </WorkspaceLayout>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <PublicHeader currentPath="/privacy" onNavigate={onNavigate} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-14">{Content}</main>
      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
}
