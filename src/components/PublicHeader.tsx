import { useAuth } from '../context/AuthContext';

interface PublicHeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function PublicHeader({ currentPath, onNavigate }: PublicHeaderProps) {
  const { user } = useAuth();

  const handleLink = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    if (currentPath !== '/') {
      onNavigate('/');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="/"
          onClick={(e) => handleLink(e, '/')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          MediScan AI
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <a
            href="/#modules"
            onClick={(e) => scrollToSection(e, 'modules')}
            className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0"
          >
            Modules
          </a>
          <a
            href="/#workflow"
            onClick={(e) => scrollToSection(e, 'workflow')}
            className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0"
          >
            How It Works
          </a>
          <a
            href="/privacy"
            onClick={(e) => handleLink(e, '/privacy')}
            className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0"
          >
            Privacy & Security
          </a>
          <a
            href="/#disclaimer"
            onClick={(e) => scrollToSection(e, 'disclaimer')}
            className="hover:text-teal-700 transition-colors whitespace-nowrap shrink-0"
          >
            Safety Notice
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => onNavigate('/dashboard')}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Dashboard
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('/register')}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Get Started
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 pb-8 border-b border-slate-200">
          <div className="max-w-md space-y-2">
            <p className="font-display text-base font-bold text-slate-900">MediScan AI</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Educational medical report and scan interpretation platform designed to help patients prepare informed questions for their healthcare providers.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
            <div className="space-y-2">
              <p className="font-semibold text-slate-900">Analysis</p>
              <ul className="space-y-1.5 text-slate-600">
                <li>
                  <button type="button" onClick={() => onNavigate('/analyze/blood')} className="hover:text-teal-700 cursor-pointer">
                    Blood Reports
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('/analyze/xray')} className="hover:text-teal-700 cursor-pointer">
                    X-ray Analysis
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('/analyze/mri')} className="hover:text-teal-700 cursor-pointer">
                    MRI Scan Review
                  </button>
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-slate-900">Account</p>
              <ul className="space-y-1.5 text-slate-600">
                <li>
                  <button type="button" onClick={() => onNavigate('/login')} className="hover:text-teal-700 cursor-pointer">
                    Sign In
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('/register')} className="hover:text-teal-700 cursor-pointer">
                    Create Account
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('/forgot-password')} className="hover:text-teal-700 cursor-pointer">
                    Reset Password
                  </button>
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-slate-900">Trust</p>
              <ul className="space-y-1.5 text-slate-600">
                <li>
                  <button type="button" onClick={() => onNavigate('/privacy')} className="hover:text-teal-700 cursor-pointer">
                    Privacy & Security
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} MediScan AI. Educational & Informational Use Only — Not a Diagnostic Device.</p>
          <p>Encrypted Medical Vault · Zero Third-Party Data Sharing</p>
        </div>
      </div>
    </footer>
  );
}
