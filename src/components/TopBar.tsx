import { Plus, RefreshCw, LogOut } from 'lucide-react';
import type { FeedKey } from '../lib/types';
import { formatShortStamp } from '../lib/format';
import { FeedToggle } from './FeedToggle';

export function TopBar({
  feed,
  feedCounts,
  onFeedChange,
  lastUpdated,
  refreshing,
  onRefresh,
  onOpenAdd,
  onLogout,
}: {
  feed: FeedKey;
  feedCounts: Record<FeedKey, number>;
  onFeedChange: (f: FeedKey) => void;
  lastUpdated?: string;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenAdd: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 font-display text-lg font-extrabold text-white shadow-sm">
            N
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-extrabold tracking-tight text-slate-900">
              Newsflow
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              Fundamental news, no price noise
            </div>
          </div>
        </div>

        {/* Feed toggle */}
        <div className="order-3 w-full sm:order-2 sm:ml-2 sm:w-auto">
          <FeedToggle value={feed} counts={feedCounts} onChange={onFeedChange} />
        </div>

        {/* Actions */}
        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          {lastUpdated && (
            <span className="hidden text-right text-[11px] leading-tight text-slate-400 lg:block">
              <span className="block uppercase tracking-wide">Updated</span>
              <span className="font-semibold tabular-nums text-slate-500">
                {formatShortStamp(lastUpdated)}
              </span>
            </span>
          )}
          <button
            onClick={onRefresh}
            title="Refresh data"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            />
          </button>
          <button
            onClick={onOpenAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span>
          </button>
          <button
            onClick={onLogout}
            title="Sign out"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
