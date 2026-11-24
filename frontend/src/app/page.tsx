'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, Mail, Send, CheckCircle2, AlertCircle,
  RefreshCw, ExternalLink, LogOut, MessageSquare, Layers,
} from 'lucide-react';

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
  previewUrl?: string | null;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000') + '/api';

function StatusBadge({ status }: { status: EmailItem['status'] }) {
  const styles: Record<EmailItem['status'], string> = {
    sent: 'bg-emerald-950 text-emerald-400 border-emerald-800',
    failed: 'bg-rose-950 text-rose-400 border-rose-800',
    processing: 'bg-blue-950 text-blue-400 border-blue-800',
    scheduled: 'bg-amber-950 text-amber-400 border-amber-800',
  };
  return (
    <span className={`inline-block border px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [delaySec, setDelaySec] = useState('2');
  const [hourlyLimit, setHourlyLimit] = useState('100');
  const [scheduledTime, setScheduledTime] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (!res.ok) { router.push('/login'); return; }
      const data = await res.json();
      setUser(data.user);
    } catch {
      router.push('/login');
    } finally {
      setAuthLoading(false);
    }
  }, [router]);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/emails?status=${activeTab}&limit=50`, { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setEmails(data.data || []); }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { setMounted(true); fetchUser(); }, [fetchUser]);
  useEffect(() => {
    if (!user) return;
    fetchEmails();
    const t = setInterval(fetchEmails, 5000);
    return () => clearInterval(t);
  }, [user, fetchEmails]);

  const handleLogout = async () => {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    router.push('/login');
  };

  const handleSlackConnect = () => { window.location.href = `${API_BASE}/slack/connect`; };
  const handleSlackDisconnect = async () => {
    await fetch(`${API_BASE}/slack/disconnect`, { method: 'DELETE', credentials: 'include' });
    fetchUser();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const matches = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      setRecipients(Array.from(new Set(matches.map((e) => e.toLowerCase()))));
    };
    reader.readAsText(file);
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) { setStatus({ type: 'error', message: 'Subject is required.' }); return; }
    if (recipients.length === 0) { setStatus({ type: 'error', message: 'Upload a CSV/TXT file with recipient emails.' }); return; }

    setSubmitting(true);
    setStatus(null);
    try {
      const startTime = scheduledTime ? new Date(scheduledTime).toISOString() : new Date().toISOString();
      const res = await fetch(`${API_BASE}/campaigns/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject,
          body: body || '<p>Hello!</p>',
          recipients,
          startTime,
          delayMs: Math.max(0, parseInt(delaySec, 10) * 1000),
          hourlyLimit: Math.max(1, parseInt(hourlyLimit, 10)),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to schedule');
      setStatus({ type: 'success', message: `✓ ${data.scheduledCount} emails scheduled (${data.deduped} deduped).` });
      setSubject(''); setBody(''); setRecipients([]); setFileName(''); setScheduledTime('');
      fetchEmails();
    } catch (err: unknown) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Error scheduling campaign' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-600 rounded-lg">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white text-sm">Outbox Scheduler</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Slack pill */}
            {user?.slackConnected ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-800/70 rounded-full text-xs text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <MessageSquare className="w-3 h-3" />
                <span>{user.slackChannel || 'Slack'}</span>
                <button onClick={handleSlackDisconnect} className="ml-0.5 text-slate-500 hover:text-rose-400 leading-none" title="Disconnect">×</button>
              </div>
            ) : (
              <button onClick={handleSlackConnect} className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full transition-colors">
                <MessageSquare className="w-3 h-3 text-amber-400" /> Connect Slack
              </button>
            )}

            {/* User */}
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-full">
              {user?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt="avatar" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              )}
              <span className="text-xs text-slate-300 max-w-[120px] truncate">{user?.name}</span>
            </div>

            <a href="http://localhost:4000/admin/queues" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full transition-colors">
              <Layers className="w-3 h-3 text-indigo-400" /> Bull Board
            </a>

            <button onClick={handleLogout} title="Log out"
              className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-slate-800/80 border border-slate-700 rounded-full transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT: Compose */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg h-fit">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-400" /> Compose & Schedule
          </h2>

          <form onSubmit={handleSchedule} className="space-y-3.5">
            {/* Subject */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Hiring Assessment Invitation"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Body (HTML or plain)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="<p>Hello candidate, here are the details...</p>"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Recipients (CSV or TXT)</label>
              <div className="relative border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-lg p-4 text-center cursor-pointer transition-colors">
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <Upload className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
                <p className="text-xs text-slate-400">{fileName || 'Click or drag file here'}</p>
              </div>
              {recipients.length > 0 && (
                <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {recipients.length} recipient{recipients.length > 1 ? 's' : ''} loaded
                </p>
              )}
            </div>

            {/* Delay + Rate limit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Delay between (sec)</label>
                <input type="number" min="0" value={delaySec} onChange={(e) => setDelaySec(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Hourly limit</label>
                <input type="number" min="1" value={hourlyLimit} onChange={(e) => setHourlyLimit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
            </div>

            {/* Send time */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Send at (leave blank = now)</label>
              <input type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]" />
            </div>

            {/* Status message */}
            {status && (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                status.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-800/70 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-800/70 text-rose-300'
              }`}>
                {status.type === 'success'
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                <span>{status.message}</span>
              </div>
            )}

            <button type="submit" disabled={submitting || recipients.length === 0}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              <Send className="w-4 h-4" />
              {submitting ? 'Scheduling...' : `Schedule ${recipients.length || 0} Email${recipients.length !== 1 ? 's' : ''}`}
            </button>
          </form>
        </div>

        {/* RIGHT: Queue */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex flex-col">
          {/* Tab bar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-800">
            <div className="flex gap-1">
              {(['scheduled', 'sent'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    activeTab === tab
                      ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}>
                  {tab === 'scheduled' ? 'Queue' : 'Sent'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <span>{emails.length} items</span>
              <button onClick={fetchEmails} title="Refresh"
                className="p-1 hover:text-slate-300 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto max-h-[560px] divide-y divide-slate-800/50">
            {loading && emails.length === 0 ? (
              <div className="py-16 text-center text-slate-600 text-sm">Loading...</div>
            ) : emails.length === 0 ? (
              <div className="py-16 text-center text-slate-600 text-sm">
                No {activeTab === 'scheduled' ? 'queued' : 'sent'} emails yet.
              </div>
            ) : (
              emails.map((email) => (
                <div key={email.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-800/30 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{email.recipient}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{email.subject}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={email.status} />
                    {email.status === 'sent' && email.previewUrl && (
                      <a href={email.previewUrl} target="_blank" rel="noopener noreferrer"
                        className="mt-1 flex items-center justify-end gap-1 text-[11px] text-indigo-400 hover:text-indigo-300">
                        <ExternalLink className="w-3 h-3" /> View email
                      </a>
                    )}
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {new Date(email.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
