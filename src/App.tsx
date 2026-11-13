import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AnalyzePage } from './pages/AnalyzePage';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportResultsPage } from './pages/ReportResultsPage';

function AppRouter() {
  const { user, loading } = useAuth();
  const [locationPath, setLocationPath] = useState(
    () => window.location.pathname + window.location.search,
  );

  useEffect(() => {
    const onPopState = () => {
      setLocationPath(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    window.history.pushState({}, '', nextPath);
    setLocationPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const [pathname, searchString = ''] = locationPath.split('?');
  const searchParams = new URLSearchParams(searchString);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="space-y-2 text-center">
          <p className="font-display text-lg font-bold text-slate-900">MediScan AI</p>
          <p className="text-sm text-slate-500">Loading secure workspace...</p>
        </div>
      </div>
    );
  }

  // Public routes
  if (pathname === '/' || pathname === '') {
    return <HomePage onNavigate={navigate} />;
  }
  if (pathname === '/login') {
    if (user) return <DashboardPage onNavigate={navigate} />;
    return <LoginPage onNavigate={navigate} />;
  }
  if (pathname === '/register') {
    if (user) return <DashboardPage onNavigate={navigate} />;
    return <RegisterPage onNavigate={navigate} />;
  }
  if (pathname === '/forgot-password') {
    return <ForgotPasswordPage onNavigate={navigate} />;
  }
  if (pathname === '/reset-password') {
    return (
      <ResetPasswordPage
        onNavigate={navigate}
        initialToken={searchParams.get('token') || ''}
      />
    );
  }
  if (pathname === '/privacy') {
    return <PrivacyPage onNavigate={navigate} />;
  }

  // Protected workspace routes — redirect unauthenticated users cleanly to LoginPage
  if (!user) {
    return <LoginPage onNavigate={navigate} />;
  }

  if (pathname === '/dashboard') {
    return <DashboardPage onNavigate={navigate} />;
  }
  if (pathname === '/analyze/blood') {
    return <AnalyzePage mode="blood" onNavigate={navigate} />;
  }
  if (pathname === '/analyze/xray') {
    return <AnalyzePage mode="xray" onNavigate={navigate} />;
  }
  if (pathname === '/analyze/mri') {
    return <AnalyzePage mode="mri" onNavigate={navigate} />;
  }
  if (pathname === '/history') {
    return <HistoryPage onNavigate={navigate} />;
  }
  if (pathname === '/profile') {
    return <ProfilePage onNavigate={navigate} />;
  }
  if (pathname.startsWith('/reports/')) {
    const id = pathname.replace('/reports/', '').split('/')[0];
    if (id) {
      return <ReportResultsPage reportId={id} onNavigate={navigate} />;
    }
  }

  return <HomePage onNavigate={navigate} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
