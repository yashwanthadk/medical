import React, { useState } from 'react';
import {
  Activity,
  Brain,
  ChevronRight,
  Droplets,
  FileClock,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface WorkspaceLayoutProps {
  currentPath: string;
  breadcrumb: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export function WorkspaceLayout({
  currentPath,
  breadcrumb,
  onNavigate,
  children,
}: WorkspaceLayoutProps) {
  const { user, logout, aiConfigured } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/analyze/blood', label: 'Blood Report', icon: Droplets },
    { path: '/analyze/xray', label: 'X-ray Analysis', icon: Activity },
    { path: '/analyze/mri', label: 'MRI Analysis', icon: Brain },
    { path: '/history', label: 'Report History', icon: FileClock },
    { path: '/profile', label: 'Profile & Account', icon: UserCheck },
    { path: '/privacy', label: 'Privacy & Security', icon: ShieldCheck },
  ];

  const handleNav = (path: string) => {
    setMobileOpen(false);
    onNavigate(path);
  };

  const handleLogout = async () => {
    await logout();
    onNavigate('/');
  };

  const SidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
        <button
          type="button"
          onClick={() => handleNav('/')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap cursor-pointer"
        >
          MediScan AI
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-2 text-slate-500 hover:text-slate-900"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4">
        <button
          type="button"
          onClick={() => handleNav('/analyze/blood')}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Upload New Report</span>
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto" aria-label="Workspace navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            currentPath === item.path ||
            (item.path === '/history' && currentPath.startsWith('/reports/'));
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNav(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-teal-50 text-teal-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="px-2">
          <p className="text-sm font-medium text-slate-900 truncate">{user?.fullName}</p>
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{SidebarContent}</div>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <button
                type="button"
                onClick={() => handleNav('/dashboard')}
                className="text-slate-500 hover:text-slate-900 whitespace-nowrap cursor-pointer"
              >
                Workspace
              </button>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              <span className="font-medium text-slate-900 truncate">{breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleNav('/history')}
              className="hidden sm:inline-flex px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              View History
            </button>
          </div>
        </header>

        {!aiConfigured && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-8 py-3 text-sm text-amber-900">
            <strong>AI Configuration Required:</strong> <code className="font-mono">GEMINI_API_KEY</code> is not set on the server. Add your Gemini API key in <strong>Settings &gt; Secrets</strong> to run medical report and scan analyses.
          </div>
        )}

        <main className="flex-1 px-4 sm:px-8 py-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
