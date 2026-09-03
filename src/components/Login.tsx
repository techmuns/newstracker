import { useState } from 'react';
import { Lock, ArrowRight } from 'lucide-react';

// Light auth stub for Prompt 1.
// TODO(Prompt 4): harden with a Cloudflare Worker salted-hash + signed-cookie gate.
const DEMO_PASSWORD = 'newsflow';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === DEMO_PASSWORD) {
      setError(false);
      onSuccess();
    } else {
      setError(true);
    }
  }

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 font-display text-2xl font-extrabold text-white shadow-lg">
            N
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
            Newsflow
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Fundamental business news about the companies you track.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70"
        >
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Password
            </span>
            <div className="relative mt-1.5">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                autoFocus
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  setError(false);
                }}
                placeholder="Enter password"
                className={`w-full rounded-lg border-0 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 shadow-sm ring-1 transition focus:outline-none focus:ring-2 ${
                  error
                    ? 'ring-rose-300 focus:ring-rose-400'
                    : 'ring-slate-200 focus:ring-indigo-400'
                }`}
              />
            </div>
          </label>

          {error && (
            <p className="mt-2 text-xs font-medium text-rose-600">
              Incorrect password. Try again.
            </p>
          )}

          <button
            type="submit"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-95"
          >
            Enter dashboard
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-4 text-center text-[11px] text-slate-400">
            Demo password: <span className="font-bold text-slate-500">newsflow</span>
          </p>
        </form>
      </div>
    </div>
  );
}
