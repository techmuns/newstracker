import { useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';
import type { NewsItem } from '../lib/types';
import {
  FilterBar,
  DEFAULT_FILTERS,
  type Filters,
} from '../components/FilterBar';
import { NewsCard } from '../components/NewsCard';
import { EmptyState } from '../components/ui/EmptyState';
import { isoDay, istToday } from '../lib/metrics';

const IMP_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

// IST calendar day, `n` days before today (YYYY-MM-DD), for the Today/Yesterday
// group labels.
function istDayOffset(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Friendly header for a date group: "Today", "Yesterday", else the full date.
// An empty day (undated items) groups under a clearly-labelled bucket at the end.
function groupLabel(day: string): string {
  if (!day) return 'Earlier / undated';
  if (day === istToday()) return 'Today';
  if (day === istDayOffset(1)) return 'Yesterday';
  const d = new Date(day + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface DayGroup {
  day: string;
  label: string;
  items: NewsItem[];
}

export function Feed({ items }: { items: NewsItem[] }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const companies = useMemo(
    () => [...new Set(items.map((i) => i.company))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const sources = useMemo(
    () => [...new Set(items.map((i) => i.source))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const shown = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const out = items.filter((it) => {
      if (filters.topic !== 'All' && it.topic !== filters.topic) return false;
      if (filters.company !== 'All' && it.company !== filters.company) return false;
      if (filters.source !== 'All' && it.source !== filters.source) return false;
      if (filters.mood !== 'All' && it.mood !== filters.mood) return false;
      if (filters.importance !== 'All' && it.importance !== filters.importance)
        return false;
      if (
        q &&
        !`${it.title} ${it.company} ${it.takeaway} ${it.keyword} ${it.ticker}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
    out.sort((a, b) =>
      filters.sort === 'newest'
        ? b.date.localeCompare(a.date)
        : IMP_RANK[a.importance] - IMP_RANK[b.importance] ||
          b.date.localeCompare(a.date),
    );
    return out;
  }, [items, filters]);

  // Group the (already-sorted) stories by their IST calendar day so the feed
  // reads chronologically — newest day first, undated last. Within each day the
  // existing sort order (newest or most-important) is preserved.
  const groups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, NewsItem[]>();
    for (const it of shown) {
      const key = isoDay(it.date || '');
      const bucket = map.get(key);
      if (bucket) bucket.push(it);
      else map.set(key, [it]);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '') return 1; // undated sinks to the bottom
      if (b === '') return -1;
      return b.localeCompare(a); // newest day first
    });
    return keys.map((day) => ({ day, label: groupLabel(day), items: map.get(day)! }));
  }, [shown]);

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        companies={companies}
        sources={sources}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />

      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-slate-500">
          Showing{' '}
          <span className="font-bold tabular-nums text-slate-700">
            {shown.length}
          </span>{' '}
          {shown.length === 1 ? 'story' : 'stories'}
        </p>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No stories match these filters"
          hint="Try clearing a filter or searching for something else."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day || 'undated'}>
              {/* Date divider */}
              <div className="mb-2.5 flex items-center gap-3">
                <h3 className="text-sm font-extrabold tracking-tight text-slate-700">
                  {g.label}
                </h3>
                <span className="text-xs font-medium tabular-nums text-slate-400">
                  {g.items.length} {g.items.length === 1 ? 'story' : 'stories'}
                </span>
                <div className="h-px flex-1 bg-slate-200/70" />
              </div>

              {/* Full-width story list for this day */}
              <div className="space-y-3">
                {g.items.map((it) => (
                  <NewsCard key={it.id} item={it} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
