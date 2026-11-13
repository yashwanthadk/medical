import React, { useState } from 'react';
import { CheckCircle2, MailCheck, Trash2 } from 'lucide-react';
import { WorkspaceLayout } from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import { authHeaders, setStoredSessionToken } from '../lib/authToken';
import type { AuthUser } from '../types/medical';

interface ProfilePageProps {
  onNavigate: (path: string) => void;
}

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  const { user, setUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');

  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleteErr, setDeleteErr] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    setSaving(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          fullName,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const data = (await res.json()) as { user?: AuthUser; message?: string; error?: string };
      if (!res.ok || !data.user) {
        setProfileErr(data.error || 'Could not update profile.');
        return;
      }
      setUser(data.user);
      setCurrentPassword('');
      setNewPassword('');
      setProfileMsg(data.message || 'Profile updated.');
    } catch {
      setProfileErr('Network error while saving profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyEmail = async () => {
    setVerifying(true);
    setVerifyMsg('');
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
        const verifyData = (await verifyRes.json()) as { user?: AuthUser };
        if (verifyRes.ok && verifyData.user) {
          setUser(verifyData.user);
          setVerifyMsg('Email address verified successfully.');
        }
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteErr('');
    setDeleting(true);
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ confirmEmail }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setDeleteErr(data.error || 'Could not delete account.');
        return;
      }
      setStoredSessionToken(null);
      setUser(null);
      onNavigate('/');
    } catch {
      setDeleteErr('Network error while deleting account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <WorkspaceLayout currentPath="/profile" breadcrumb="User Profile" onNavigate={onNavigate}>
      <div className="space-y-8 max-w-3xl">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            User Profile &amp; Account Security
          </h1>
          <p className="text-sm text-slate-600">
            Update your account details, verify your email address, change your password, or permanently delete your data.
          </p>
        </div>

        {/* Account Info & Verification Status */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Registered Email</p>
              <p className="text-sm font-semibold text-slate-900">{user?.email}</p>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                Member since {user ? new Date(user.createdAt).toLocaleDateString() : ''}
              </p>
            </div>
            {user?.emailVerified ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md w-fit">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Email Verified</span>
              </span>
            ) : (
              <button
                type="button"
                disabled={verifying}
                onClick={handleVerifyEmail}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 cursor-pointer w-fit"
              >
                <MailCheck className="w-4 h-4" />
                <span>{verifying ? 'Verifying...' : 'Verify Email Now'}</span>
              </button>
            )}
          </div>
          {verifyMsg && (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2">
              {verifyMsg}
            </p>
          )}
        </section>

        {/* Update Name & Password */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Profile &amp; Password Settings
          </h2>

          {profileErr && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {profileErr}
            </div>
          )}
          {profileMsg && (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
              {profileMsg}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="prof-name" className="block text-sm font-medium text-slate-700">
                Full Name
              </label>
              <input
                id="prof-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-4">
              <p className="text-xs font-semibold text-slate-600">
                Change Password (leave blank to keep current password)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="prof-cur-pw" className="block text-sm font-medium text-slate-700">
                    Current Password
                  </label>
                  <input
                    id="prof-cur-pw"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="prof-new-pw" className="block text-sm font-medium text-slate-700">
                    New Password
                  </label>
                  <input
                    id="prof-new-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 chars, letters + numbers"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </section>

        {/* Account Deletion */}
        <section className="bg-white border border-red-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-red-800">
            <Trash2 className="w-5 h-5" />
            <h2 className="font-display text-lg font-bold">Delete Account &amp; Medical Data</h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Deleting your account permanently removes your profile, ends all sessions, deletes every analysis record, and shreds all encrypted medical files from private storage. This cannot be undone.
          </p>

          {deleteErr && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {deleteErr}
            </div>
          )}

          <form onSubmit={handleDeleteAccount} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={`Type ${user?.email || 'your email'} to confirm`}
              className="flex-1 px-3.5 py-2 text-sm border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            <button
              type="submit"
              disabled={deleting}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              {deleting ? 'Deleting Account...' : 'Permanently Delete Account'}
            </button>
          </form>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
