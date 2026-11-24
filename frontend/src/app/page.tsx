'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Mail, Calendar, Clock, Send, CheckCircle2, AlertCircle, RefreshCw, Layers, ExternalLink, LogOut, MessageSquare } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  slackConnected: boolean;
  slackChannel?: string | null;
}

interface EmailItem {
  id: string;
  recipient: string;
  subject: string;
  status: 'scheduled' | 'processing' | 'sent' | 'failed';
  scheduledAt: string;
  sentAt?: string | null;
  attempts: number;
  messageId?: string | null;
}

const API_BASE = 'http://localhost:4000/api';

export default function Dashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Tabs & Data
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [delaySec, setDelaySec] = useState('2');
  const [hourlyLimit, setHourlyLimit] = useState('100');
  const [scheduleStatus, setScheduleStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 1. Fetch authenticated user profile via signed httpOnly cookie
  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include',
      });
      if (!res.ok) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      setUser(data.user);
    } catch {
      router.push('/login');
    } finally {
      setAuthLoading(false);
    }
  }, [router]);

  // 2. Fetch user-scoped emails
  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/emails?status=${activeTab}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setEmails(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load emails:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setMounted(true);
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (user) {
      fetchEmails();
      const interval = setInterval(fetchEmails, 5000);
      return () => clearInterval(interval);
    }
  }, [user, fetchEmails]);

  // Logout
  const handleLogout = async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    router.push('/login');
  };

  // Slack Connect / Disconnect
  const handleSlackConnect = () => {
    window.location.href = `${API_BASE}/slack/connect`;
  };

  const handleSlackDisconnect = async () => {
    await fetch(`${API_BASE}/slack/disconnect`, {
      method: 'DELETE',
      credentials: 'include',
    });
    fetchUser();
  };

  // CSV/TXT File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = content.match(emailRegex) || [];
      const unique = Array.from(new Set(matches.map((email) => email.toLowerCase())));
      setRecipients(unique);
    };
    reader.readAsText(file);
  };

  // Submit Schedule Campaign
  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setScheduleStatus({ type: 'error', message: 'Subject is required.' });
      return;
    }
    if (recipients.length === 0) {
      setScheduleStatus({ type: 'error', message: 'Please upload a CSV file or enter recipients.' });
      return;
    }

    setSubmitting(true);
    setScheduleStatus(null);

    try {
      const payload = {
        subject,
        body: body || '<p>Default message body</p>',
        recipients,
        startTime: new Date().toISOString(),
        delayMs: Math.max(0, parseInt(delaySec, 10) * 1000),
        hourlyLimit: Math.max(1, parseInt(hourlyLimit, 10)),
      };

      const res = await fetch(`${API_BASE}/campaigns/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to schedule campaign');
      }

      setScheduleStatus({
        type: 'success',
        message: `Success! ${data.scheduledCount} emails enqueued into BullMQ (deduped: ${data.deduped}).`,
      });

      setSubject('');
      setBody('');
      setRecipients([]);
      setFileName('');
      fetchEmails();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error scheduling campaign';
      setScheduleStatus({ type: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Authenticating session...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header with User Profile & Slack OAuth */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Outbox Scheduler</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Production BullMQ Delayed Job Dispatcher with Atomic Idempotency
          </p>
        </div>

        {/* User Info, Slack Button, and Logout */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Slack Status / Connect Pill */}
          {user?.slackConnected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Slack Connected ({user.slackChannel || 'Alerts'})</span>
              <button
                onClick={handleSlackDisconnect}
                className="ml-1 text-slate-400 hover:text-rose-400 font-bold"
                title="Disconnect Slack"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={handleSlackConnect}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition-colors shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
              Connect Slack
            </button>
          )}

          {/* User Profile Pill */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
            {user?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                {user?.name?.charAt(0) || 'U'}
              </div>
            )}
            <div className="text-left">
              <p className="text-xs font-semibold text-white leading-tight">{user?.name}</p>
              <p className="text-[10px] text-slate-400 leading-tight">{user?.email}</p>
            </div>
          </div>

          <a
            href="http://localhost:4000/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Bull Board
          </a>

          <button
            onClick={handleLogout}
            className="p-2 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 text-slate-400 rounded-xl border border-slate-700 transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Grid: Form + Live Job Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
        {/* Left Side: Upload & Schedule */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Send className="w-5 h-5 text-indigo-400" />
            Compose & Schedule Batch
          </h2>

          <form onSubmit={handleSchedule} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Subject Line
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Hiring Assessment Invitation"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Body Content (HTML/Plain)
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="<p>Hello candidate, here are the details...</p>"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* CSV/TXT Upload Box */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Recipient Email List (CSV or TXT)
              </label>
              <div className="relative border-2 border-dashed border-slate-800 hover:border-indigo-500/60 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-950/50">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-300">
                  {fileName ? fileName : 'Click or drag CSV/TXT file here'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Extracts & dedupes emails automatically on upload
                </p>
              </div>

              {recipients.length > 0 && (
                <div className="mt-2 text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Found {recipients.length} unique recipient(s) ready to schedule
                </div>
              )}
            </div>

            {/* Settings Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Delay Between (sec)
                </label>
                <input
                  type="number"
                  min="0"
                  value={delaySec}
                  onChange={(e) => setDelaySec(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Hourly Rate Limit
                </label>
                <input
                  type="number"
                  min="1"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {scheduleStatus && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  scheduleStatus.type === 'success'
                    ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
                    : 'bg-rose-950/60 border border-rose-800/80 text-rose-300'
                }`}
              >
                {scheduleStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{scheduleStatus.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || recipients.length === 0}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Scheduling with BullMQ...' : `Schedule ${recipients.length || 0} Emails`}
            </button>
          </form>
        </div>

        {/* Right Side: Tabbed Table */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col">
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'scheduled'
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Scheduled Queue
              </button>
              <button
                onClick={() => setActiveTab('sent')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'sent'
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sent History
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{emails.length} items</span>
              <button
                onClick={fetchEmails}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Table List */}
          <div className="flex-1 overflow-y-auto max-h-[500px]">
            {loading && emails.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">Loading jobs...</div>
            ) : emails.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-sm">
                No {activeTab} emails found.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {emails.map((email) => (
                  <div key={email.id} className="py-3 px-2 hover:bg-slate-800/30 rounded-lg transition-colors flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{email.recipient}</p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{email.subject}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                          email.status === 'sent'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : email.status === 'failed'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {email.status}
                      </span>
                      {email.status === 'sent' && (
                        <div className="mt-1">
                          <a
                            href="https://ethereal.email/messages"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center justify-end gap-1 font-medium underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View in Inbox
                          </a>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-end gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(email.scheduledAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
