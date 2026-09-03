import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Company, FeedKey, NewsItem } from './lib/types';
import { loadAll, type AppData } from './lib/data';
import {
  getCustomKeywords,
  setCustomKeywords,
  getCustomWatchlist,
  setCustomWatchlist,
  isAuthed,
  setAuthed,
} from './lib/storage';
import { Login } from './components/Login';
import { TopBar } from './components/TopBar';
import { Tabs, type TabKey } from './components/Tabs';
import { AddPanel } from './components/AddPanel';
import { Pulse } from './pages/Pulse';
import { Feed } from './pages/Feed';
import { Filings } from './pages/Filings';

const FEED_DESC: Record<FeedKey, string> = {
  portfolio: 'Your current holdings',
  watchlist: 'Holdings, exited names & anything you add',
  universe: 'Keyword-led discovery beyond your companies',
};

function scopeCount(items: NewsItem[], key: FeedKey): number {
  return items.filter((i) => i.scope.includes(key)).length;
}

export default function App() {
  const [authed, setAuthedState] = useState<boolean>(() => isAuthed());
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [feed, setFeed] = useState<FeedKey>('portfolio');
  const [tab, setTab] = useState<TabKey>('pulse');
  const [addOpen, setAddOpen] = useState(false);

  const [customKeywords, setCustomKeywordsState] = useState<string[]>(() =>
    getCustomKeywords(),
  );
  const [customWatchlist, setCustomWatchlistState] = useState<Company[]>(() =>
    getCustomWatchlist(),
  );

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const d = await loadAll();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authed) void fetchData();
  }, [authed, fetchData]);

  /* ---- customisation handlers (persisted) ---- */
  const addKeywords = useCallback(
    (words: string[]) => {
      const base = new Set(
        (data?.keywords.base ?? []).map((w) => w.toLowerCase()),
      );
      setCustomKeywordsState((prev) => {
        const seen = new Set(prev.map((w) => w.toLowerCase()));
        const merged = [...prev];
        for (const w of words) {
          const lw = w.toLowerCase();
          if (!seen.has(lw) && !base.has(lw)) {
            merged.push(w);
            seen.add(lw);
          }
        }
        setCustomKeywords(merged);
        return merged;
      });
    },
    [data],
  );

  const removeKeyword = useCallback((kw: string) => {
    setCustomKeywordsState((prev) => {
      const next = prev.filter((w) => w !== kw);
      setCustomKeywords(next);
      return next;
    });
  }, []);

  const addCompany = useCallback((c: Company) => {
    setCustomWatchlistState((prev) => {
      if (prev.some((x) => x.ticker === c.ticker)) return prev;
      const next = [...prev, c];
      setCustomWatchlist(next);
      return next;
    });
  }, []);

  const removeCompany = useCallback((ticker: string) => {
    setCustomWatchlistState((prev) => {
      const next = prev.filter((x) => x.ticker !== ticker);
      setCustomWatchlist(next);
      return next;
    });
  }, []);

  function handleLogout() {
    setAuthed(false);
    setAuthedState(false);
  }

  /* ---- derived data ---- */
  const newsItems = data?.news.items ?? [];

  const feedItems = useMemo(
    () => newsItems.filter((i) => i.scope.includes(feed)),
    [newsItems, feed],
  );

  const feedCounts = useMemo<Record<FeedKey, number>>(
    () => ({
      portfolio: scopeCount(newsItems, 'portfolio'),
      watchlist: scopeCount(newsItems, 'watchlist'),
      universe: scopeCount(newsItems, 'universe'),
    }),
    [newsItems],
  );

  const knownCompanies = useMemo<Company[]>(() => {
    if (!data) return customWatchlist;
    return [
      ...data.companies.portfolio,
      ...data.companies.watchlist_exited,
      ...customWatchlist,
    ];
  }, [data, customWatchlist]);

  const trackedTickers = useMemo(
    () => new Set(knownCompanies.map((c) => c.ticker)),
    [knownCompanies],
  );

  /* ---- render ---- */
  if (!authed) {
    return (
      <Login
        onSuccess={() => {
          setAuthed(true);
          setAuthedState(true);
        }}
      />
    );
  }

  return (
    <div className="app-bg min-h-screen">
      <TopBar
        feed={feed}
        feedCounts={feedCounts}
        onFeedChange={setFeed}
        lastUpdated={data?.news.generated_at}
        refreshing={refreshing}
        onRefresh={() => void fetchData(true)}
        onOpenAdd={() => setAddOpen(true)}
        onLogout={handleLogout}
      />

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {/* Sub-nav */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onChange={setTab} />
          <p className="text-xs font-medium text-slate-500">
            <span className="font-bold capitalize text-slate-700">{feed}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            {FEED_DESC[feed]}
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-28 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="mt-3 text-sm font-medium">Loading your newsflow…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-6 py-20 text-center ring-1 ring-slate-200/70">
            <AlertTriangle className="h-8 w-8 text-rose-500" />
            <p className="mt-3 text-sm font-bold text-slate-800">
              Couldn&apos;t load the data
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">{error}</p>
            <button
              onClick={() => void fetchData()}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {tab === 'pulse' && <Pulse items={feedItems} />}
            {tab === 'feed' && <Feed key={feed} items={feedItems} />}
            {tab === 'filings' && <Filings filings={data?.filings.items ?? []} />}
          </>
        )}
      </main>

      {data && (
        <AddPanel
          open={addOpen}
          onClose={() => setAddOpen(false)}
          buckets={data.keywords.buckets}
          customKeywords={customKeywords}
          onAddKeywords={addKeywords}
          onRemoveKeyword={removeKeyword}
          knownCompanies={knownCompanies}
          trackedTickers={trackedTickers}
          customWatchlist={customWatchlist}
          onAddCompany={addCompany}
          onRemoveCompany={removeCompany}
        />
      )}
    </div>
  );
}
