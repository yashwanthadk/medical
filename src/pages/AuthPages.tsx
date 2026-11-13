import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, MailCheck } from 'lucide-react';
import { PublicHeader } from '../components/PublicHeader';
import { useAuth } from '../context/AuthContext';
import { setStoredSessionToken } from '../lib/authToken';
import type { AuthUser } from '../types/medical';

interface AuthPageProps {
  onNavigate: (path: string) => void;
}

export function LoginPage({ onNavigate }: AuthPageProps) {
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as {
        user?: AuthUser;
        sessionToken?: string;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setError(data.error || 'Unable to sign in. Please check your credentials.');
        return;
      }
      if (data.sessionToken) setStoredSessionToken(data.sessionToken);
      setUser(data.user);
      onNavigate('/dashboard');
    } catch {
      setError('Network error while signing in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <PublicHeader currentPath="/login" onNavigate={onNavigate} />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold text-slate-900">Sign In to MediScan AI</h1>
            <p className="text-sm text-slate-600">
              Access your encrypted medical report history and AI analysis workspace.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => onNavigate('/forgot-password')}
                  className="text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {submitting ? 'Signing In...' : 'Login'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 text-center text-sm text-slate-600">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => onNavigate('/register')}
              className="font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export function RegisterPage({ onNavigate }: AuthPageProps) {
  const { setUser } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdVerificationToken, setCreatedVerificationToken] = useState<string | null>(null);
  const [verifiedNow, setVerifiedNow] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters and include both letters and numbers.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fullName, email, password, confirmPassword }),
      });
      const data = (await res.json()) as {
        user?: AuthUser;
        sessionToken?: string;
        verificationToken?: string;
        error?: string;
      };
      if (!res.ok || !data.user) {
        setError(data.error || 'Could not create account.');
        return;
      }
      if (data.sessionToken) setStoredSessionToken(data.sessionToken);
      setUser(data.user);
      if (data.verificationToken) {
        setCreatedVerificationToken(data.verificationToken);
      } else {
        onNavigate('/dashboard');
      }
    } catch {
      setError('Network error while creating account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyImmediate = async () => {
    if (!createdVerificationToken) return;
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: createdVerificationToken }),
    });
    const data = (await res.json()) as { user?: AuthUser };
    if (res.ok && data.user) {
      setUser(data.user);
      setVerifiedNow(true);
    }
  };

  if (createdVerificationToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PublicHeader currentPath="/register" onNavigate={onNavigate} />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-5">
            <div className="flex items-center gap-2.5 text-teal-700">
              <MailCheck className="w-6 h-6" />
              <h1 className="font-display text-xl font-bold text-slate-900">
                {verifiedNow ? 'Email Verified' : 'Verify Your Email Address'}
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {verifiedNow
                ? 'Your email address is verified and your private medical vault is ready.'
                : `Your account for ${email} has been created with secure password hashing. Confirm your email verification below to complete setup.`}
            </p>
            {!verifiedNow ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleVerifyImmediate}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors cursor-pointer"
                >
                  Verify Email Address Now
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/dashboard')}
                  className="w-full py-2.5 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Continue to Dashboard (Verify Later)
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('/dashboard')}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors cursor-pointer"
              >
                Open Dashboard
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <PublicHeader currentPath="/register" onNavigate={onNavigate} />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold text-slate-900">Create Account</h1>
            <p className="text-sm text-slate-600">
              Your medical reports are encrypted and kept private to your account.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700">
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jordan Taylor"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 chars with letters & numbers"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-700">
                Confirm Password
              </label>
              <input
                id="reg-confirm"
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {submitting ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export function ForgotPasswordPage({ onNavigate }: AuthPageProps) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        message?: string;
        resetToken?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || 'Unable to process reset request.');
        return;
      }
      setMessage(data.message || 'Password reset instructions prepared.');
      if (data.resetToken) {
        setResetToken(data.resetToken);
      }
    } catch {
      setError('Network error while requesting password reset.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <PublicHeader currentPath="/forgot-password" onNavigate={onNavigate} />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Login</span>
          </button>

          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold text-slate-900">Forgot Password</h1>
            <p className="text-sm text-slate-600">
              Enter the email address associated with your MediScan AI account to reset your password.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
              {error}
            </div>
          )}

          {message && (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 space-y-3">
              <p>{message}</p>
              {resetToken && (
                <button
                  type="button"
                  onClick={() => onNavigate(`/reset-password?token=${encodeURIComponent(resetToken)}`)}
                  className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer"
                >
                  Open Password Reset Form
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="fp-email" className="block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <input
                id="fp-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {submitting ? 'Preparing Reset Link...' : 'Send Password Reset Link'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export function ResetPasswordPage({
  onNavigate,
  initialToken,
}: AuthPageProps & { initialToken: string }) {
  const { setUser } = useAuth();
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Could not reset password.');
        return;
      }
      setUser(null);
      setDone(true);
    } catch {
      setError('Network error while resetting password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <PublicHeader currentPath="/reset-password" onNavigate={onNavigate} />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold text-slate-900">Set New Password</h1>
            <p className="text-sm text-slate-600">
              Choose a strong password for your MediScan AI account.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
              {error}
            </div>
          )}

          {done ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-sm text-emerald-900">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                <span>Your password has been updated and prior sessions cleared. Please sign in with your new password.</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 cursor-pointer"
              >
                Continue to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!initialToken && (
                <div className="space-y-1.5">
                  <label htmlFor="rp-token" className="block text-sm font-medium text-slate-700">
                    Reset Token
                  </label>
                  <input
                    id="rp-token"
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="rp-new" className="block text-sm font-medium text-slate-700">
                  New Password
                </label>
                <input
                  id="rp-new"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 chars with letters & numbers"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rp-confirm" className="block text-sm font-medium text-slate-700">
                  Confirm New Password
                </label>
                <input
                  id="rp-confirm"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Updating Password...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
