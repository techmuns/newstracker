// Client for the Worker's /api/custom routes (Prompt 3), backed by Cloudflare
// KV. localStorage (see storage.ts) is kept as an offline cache / fallback so
// the UI still works before deploy or when the Worker is unreachable (e.g. the
// Vite dev server, where /api/* isn't served).

import type { Company } from './types';
import {
  getCustomKeywords,
  setCustomKeywords,
  getCustomWatchlist,
  setCustomWatchlist,
} from './storage';

const API = '/api/custom';

export interface CustomStock {
  name: string;
  ticker?: string;
}

function slug(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'CUSTOM';
}

function toCompany(s: CustomStock): Company {
  return { company: s.name, ticker: s.ticker || slug(s.name), sector: 'Custom' };
}

// Load custom lists from KV; fall back to the localStorage cache on any failure.
export async function loadCustom(): Promise<{ keywords: string[]; stocks: Company[] }> {
  try {
    const res = await fetch(API, { headers: { accept: 'application/json' } });
    if (res.ok) {
      const j = (await res.json()) as { keywords?: string[]; stocks?: CustomStock[] };
      const keywords = Array.isArray(j.keywords) ? j.keywords : [];
      const stocks = (Array.isArray(j.stocks) ? j.stocks : []).map(toCompany);
      // Keep the offline cache in sync.
      setCustomKeywords(keywords);
      setCustomWatchlist(stocks);
      return { keywords, stocks };
    }
  } catch {
    /* offline / worker not reachable — use cache below */
  }
  return { keywords: getCustomKeywords(), stocks: getCustomWatchlist() };
}

async function push(
  method: 'POST' | 'DELETE',
  type: 'keyword' | 'stock',
  value: unknown,
): Promise<boolean> {
  try {
    const res = await fetch(API, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const addKeywordRemote = (kw: string) => push('POST', 'keyword', kw);
export const removeKeywordRemote = (kw: string) => push('DELETE', 'keyword', kw);
export const addStockRemote = (c: Company) =>
  push('POST', 'stock', { name: c.company, ticker: c.ticker });
export const removeStockRemote = (c: Company) =>
  push('DELETE', 'stock', { name: c.company, ticker: c.ticker });
