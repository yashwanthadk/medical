import { useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, Lock, ShieldAlert, UploadCloud } from 'lucide-react';
import { PublicFooter, PublicHeader } from '../components/PublicHeader';
import { useAuth } from '../context/AuthContext';

interface HomePageProps {
  onNavigate: (path: string) => void;
}

function ImageWithFallback({
  src,
  alt,
  className,
  fallbackLabel,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`bg-slate-100 flex items-center justify-center p-8 text-center ${className || ''}`}>
        <div className="space-y-2">
          <FileText className="w-8 h-8 text-teal-700 mx-auto" />
          <p className="text-sm font-medium text-slate-700">{fallbackLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      <PublicHeader currentPath="/" onNavigate={onNavigate} />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50/70 to-white">
          <div className="max-w-7xl mx-auto px-6 py-16 lg:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                <p className="text-sm font-medium text-teal-700">
                  Educational Medical Report &amp; Imaging Clarity
                </p>
                <h1
                  className="font-display font-bold tracking-tight text-slate-900 text-balance leading-[1.12]"
                  style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)' }}
                >
                  Understand Your Medical Reports with AI
                </h1>
                <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  Upload blood test reports, X-ray radiographs, or MRI scan images to receive clear, structured explanations in everyday language along with a downloadable medical summary PDF.
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigate(user ? '/dashboard' : '/register')}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>{user ? 'Go to Dashboard' : 'Get Started'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {!user && (
                    <button
                      type="button"
                      onClick={() => onNavigate('/login')}
                      className="inline-flex items-center px-5 py-3 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Sign In
                    </button>
                  )}
                </div>

                <div className="pt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                  <span>Blood Panels (PDF / Image)</span>
                  <span aria-hidden="true">·</span>
                  <span>Bone &amp; Chest X-rays</span>
                  <span aria-hidden="true">·</span>
                  <span>Brain, Muscle &amp; Soft Tissue MRI</span>
                </div>
              </div>

              <div className="lg:col-span-6 flex">
                <div className="w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <ImageWithFallback
                    src="/src/assets/images/hero_clinical_clarity_1794590031162.jpg"
                    alt="Modern clinical desk displaying structured laboratory charts and medical scan review"
                    className="w-full h-full min-h-[300px] lg:h-full object-cover"
                    fallbackLabel="MediScan AI Clinical Review Workspace"
                  />
                </div>
              </div>
            </div>

            {/* Full-width 4-column capability strip below hero split */}
            <div className="mt-14 pt-10 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <p className="text-sm font-semibold text-slate-900">Plain-Language Breakdown</p>
                <p className="mt-1 text-sm text-slate-600">
                  Translates complex lab markers and radiology terms into clear explanations anyone can follow.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Reference Range Comparison</p>
                <p className="mt-1 text-sm text-slate-600">
                  Highlights values within range, borderline levels needing attention, and flagged markers.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Encrypted Private Vault</p>
                <p className="mt-1 text-sm text-slate-600">
                  Every uploaded report is encrypted at rest and strictly isolated to your authenticated account.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Structured PDF Summary</p>
                <p className="mt-1 text-sm text-slate-600">
                  Download an organized summary report to bring directly to your physician or specialist visit.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Three Analysis Modules (Asymmetric Bento Grid) */}
        <section id="modules" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl space-y-3 mb-12">
              <p className="text-sm font-medium text-teal-700">Core Analysis Modules</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Three focused tools for laboratory reports and diagnostic scans
              </h2>
              <p className="text-base text-slate-600">
                Select the module that matches your document so the platform applies tailored extraction and educational safety framing.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Featured Marquee Card: Blood Report Analysis */}
              <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
                <div className="aspect-[4/3] bg-slate-100 overflow-hidden border-b border-slate-200">
                  <ImageWithFallback
                    src="/src/assets/images/module_blood_panel_1794590031088.jpg"
                    alt="Clinical laboratory blood sample vials arranged for hematology analysis"
                    className="w-full h-full object-cover"
                    fallbackLabel="Blood Report Analysis"
                  />
                </div>
                <div className="p-7 flex-1 flex flex-col justify-between space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>01. Laboratory Panels</span>
                      <span aria-hidden="true">·</span>
                      <span>PDF, JPG, JPEG, PNG</span>
                    </div>
                    <h3 className="font-display text-xl font-bold text-slate-900">
                      Blood Report Analysis
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Extracts Hemoglobin (HB), RBC, WBC, Platelets, Blood Sugar, Cholesterol, Creatinine, Vitamin D, and Vitamin B12. Compares each measurement against laboratory reference ranges and highlights normal, borderline, and flagged values.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(user ? '/analyze/blood' : '/register')}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
                    >
                      <span>Analyze Blood Report</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: X-ray + MRI Stacked */}
              <div className="lg:col-span-6 grid grid-cols-1 gap-8">
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden grid grid-cols-1 sm:grid-cols-12">
                  <div className="sm:col-span-5 bg-slate-100 border-b sm:border-b-0 sm:border-r border-slate-200">
                    <ImageWithFallback
                      src="/src/assets/images/module_xray_imaging_1794590031855.jpg"
                      alt="Diagnostic chest and skeletal X-ray workstation display"
                      className="w-full h-full min-h-[200px] object-cover"
                      fallbackLabel="X-ray Analysis"
                    />
                  </div>
                  <div className="sm:col-span-7 p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>02. Radiography</span>
                        <span aria-hidden="true">·</span>
                        <span>JPG, JPEG, PNG</span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        X-ray Analysis — Bones &amp; Chest
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Reviews Bone X-rays for visible alignment, joint margins, and possible fracture lines, and Chest X-rays for lung field clarity, cardiac silhouette, and possible signs of fluid or infection—always paired with radiologist review guidance.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate(user ? '/analyze/xray' : '/register')}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800 w-fit cursor-pointer"
                    >
                      <span>Analyze X-ray Image</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden grid grid-cols-1 sm:grid-cols-12">
                  <div className="sm:col-span-5 bg-slate-100 border-b sm:border-b-0 sm:border-r border-slate-200">
                    <ImageWithFallback
                      src="/src/assets/images/module_mri_neuro_1794590032481.jpg"
                      alt="Diagnostic MRI neuroimaging monitor displaying axial brain slices"
                      className="w-full h-full min-h-[200px] object-cover"
                      fallbackLabel="MRI Scan Analysis"
                    />
                  </div>
                  <div className="sm:col-span-7 p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>03. Magnetic Resonance</span>
                        <span aria-hidden="true">·</span>
                        <span>JPG, JPEG, PNG</span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        MRI Analysis — Brain, Muscles &amp; Soft Tissues
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Explains visible brain anatomy, skeletal muscle structures, and soft tissue planes with explicit single-slice limitations and clear educational descriptions of any visible signal variations.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate(user ? '/analyze/mri' : '/register')}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800 w-fit cursor-pointer"
                    >
                      <span>Analyze MRI Image</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="workflow" className="py-20 bg-slate-50 border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl space-y-3 mb-12">
              <p className="text-sm font-medium text-teal-700">How It Works</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance">
                From upload to a structured summary in four steps
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  step: '01. Create Your Private Account',
                  body: 'Register with verified credentials so every uploaded medical document stays isolated inside your personal dashboard.',
                  icon: Lock,
                },
                {
                  step: '02. Upload & Validate File',
                  body: 'Select Blood Report, X-ray, or MRI and upload a PDF, JPG, or PNG. File type, size, and image clarity are checked automatically.',
                  icon: UploadCloud,
                },
                {
                  step: '03. Review Plain-Language Insights',
                  body: 'Inspect color-coded indicators, key observations, normal vs flagged findings, image quality notes, and AI limitations.',
                  icon: CheckCircle2,
                },
                {
                  step: '04. Download PDF Summary',
                  body: 'Export a cleanly formatted medical summary report containing all observations and precautions for your doctor appointment.',
                  icon: FileText,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.step} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                    <Icon className="w-5 h-5 text-teal-700" aria-hidden="true" />
                    <h3 className="font-display text-base font-bold text-slate-900">{item.step}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Privacy & Medical Safety Section */}
        <section id="disclaimer" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-6 space-y-4">
              <p className="text-sm font-medium text-teal-700">Privacy &amp; Data Protection</p>
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                Built with encryption at rest and strict user isolation
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Uploaded medical PDFs and diagnostic images are validated by file signature, encrypted with AES-256-GCM before storage, and accessible exclusively to your authenticated session. You can permanently delete any individual report or your entire account at any time.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('/privacy')}
                className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
              >
                <span>Read Privacy &amp; Security Architecture</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="lg:col-span-6 rounded-xl border border-amber-200 bg-amber-50/70 p-7 space-y-3">
              <div className="flex items-center gap-2.5 text-amber-900">
                <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
                <h3 className="font-display text-base font-bold">Important Medical Disclaimer</h3>
              </div>
              <p className="text-sm text-amber-950/90 leading-relaxed">
                MediScan AI is designed strictly for educational and informational purposes. AI-generated observations are <strong>not a medical diagnosis</strong> and must never replace evaluation by a qualified physician, hematologist, or board-certified radiologist.
              </p>
              <p className="text-sm text-amber-950/90 leading-relaxed">
                General multimodal AI models cannot detect or rule out every fracture, lesion, infection, or condition. Always consult a licensed clinician for abnormal or uncertain results, and seek emergency medical care immediately for severe or urgent symptoms.
              </p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
}
