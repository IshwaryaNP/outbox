'use client';

import React from 'react';

export default function LoginPage() {
  const [demoLoading, setDemoLoading] = React.useState(false);

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const RAILWAY_API = 'https://wholesome-quietude-production.up.railway.app';

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      // Try proxy first, fall back to direct Railway URL (cross-domain safe)
      let res = await fetch('/api/auth/demo', { method: 'POST' }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${RAILWAY_API}/api/auth/demo`, { method: 'POST' });
      }
      if (res && res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem('auth_token', data.token);
          window.location.href = '/';
          return;
        }
      }
      alert('Demo login failed. Please try again.');
    } catch (e) {
      console.error('Demo login error', e);
      alert('Demo login error: ' + String(e));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/20">
          ✉️
        </div>
        <h2 className="mt-6 text-3xl font-extrabold text-white tracking-tight">
          Sign in to Outbox
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Distributed Email Job Scheduler & BullMQ Engine
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 py-8 px-6 shadow-2xl border border-slate-800 rounded-2xl sm:px-10">
          <div className="space-y-6">
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              Authenticate via Google OAuth 2.0. A secure, signed <code className="text-indigo-400">httpOnly</code> session cookie will be issued.
            </p>

            <button
              onClick={handleGoogleLogin}
              className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-slate-700 rounded-xl shadow-sm bg-white text-slate-900 font-semibold hover:bg-slate-100 transition-colors focus:outline-none"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-2 text-slate-500">Or Instant Access</span>
              </div>
            </div>

            <button
              onClick={handleDemoLogin}
              disabled={demoLoading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-indigo-500/30 rounded-xl shadow-sm bg-indigo-600/20 text-indigo-300 font-semibold hover:bg-indigo-600/30 transition-colors focus:outline-none"
            >
              <span>{demoLoading ? 'Signing in...' : '⚡ Demo / Evaluator Sign In (1-Click)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
