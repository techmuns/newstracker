// Newsflow news scraper (Prompt 2).
//
// Backbone: Google News RSS (free, no key). Supplement: Munshot news-search
// (only if MUNS_TOKEN set). Keyword-match = the fundamental filter; a crude
// regex drops obvious price noise. Mood / importance / takeaway are safe
// defaults here — the real Claude brain arrives in Prompt 3.
//
// Writes public/data/news.json in the exact shape the dashboard already reads.
// Never blanks the file: if no source produces items, the previous file stays.

import {
  maybeSetupProxy,
  readJSON,
  writeJSON,
  NEWS_PATH,
  loadCompanies,
  loadKeywords,
  buildKeywordMatcher,
  isNoise,
  mentionsCompany,
  googleNews,
  resolveUrl,
  fetchWithTimeout,
  mapLimit,
  mergeItems,
  countsByScope,
  normalizeUrl,
  sha1short,
  cleanText,
  stripHtml,
  hostname,
  nowISO,
  daysAgo,
  ymd,
} from './lib/util.mjs';
import { firecrawlNews } from './lib/firecrawl.mjs';

const MUNS_TOKEN = process.env.MUNS_TOKEN || '';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const PER_COMPANY_CAP = 8;
const UNIVERSE_PER_QUERY = 2;

// Company-agnostic theme queries for the (light) Universe pass.
const UNIVERSE = [
  { q: '"R32 refrigerant" (anti-dumping OR duty OR import)', label: 'R32 Refrigerant', ticker: 'GLOBAL', sector: 'Chemicals', keyword: 'Anti-dumping duty' },
  { q: 'India defence exports order', label: 'India Defence Exports', ticker: 'MACRO', sector: 'Capital Goods', keyword: 'Order' },
  { q: '"optical fibre" (price OR demand OR shortage)', label: 'Optical Fibre', ticker: 'GLOBAL', sector: 'Telecom', keyword: 'Capex' },
  { q: 'PFAS fluorochemical regulation Europe', label: 'PFAS Regulation', ticker: 'GLOBAL', sector: 'Chemicals', keyword: 'Regulation' },
  { q: 'chlor-alkali caustic soda price India', label: 'Chlor-Alkali', ticker: 'GLOBAL', sector: 'Chemicals', keyword: 'Capex' },
];

const stat = {
  googleKept: 0,
  googleErrors: 0,
  munshotKept: 0,
  firecrawlKept: 0,
  universeKept: 0,
};

function titleKey(it) {
  return `${String(it.title || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${String(
    it.company || '',
  ).toLowerCase()}`;
}

function toNewsItem(raw, company, matcher) {
  const text = `${raw.title} ${raw.snippet || ''}`;
  if (!mentionsCompany(company, text)) return null; // must be about this company
  const hit = matcher.match(text);
  if (!hit) return null; // fundamental filter: must match a tracked keyword
  if (isNoise(raw.title)) return null; // crude price-noise pre-filter
  const url = raw.link;
  return {
    id: 'n' + sha1short(normalizeUrl(url)),
    ticker: company.ticker,
    company: company.company,
    sector: company.sector || '',
    scope: company.scope,
    title: raw.title,
    url,
    source: raw.source || hostname(url),
    date: raw.date,
    topic: hit.topic,
    keyword: hit.keyword,
    importance: 'medium', // TODO(Prompt 3): Claude sets real importance
    mood: 'neutral', // TODO(Prompt 3): Claude sets real mood
    takeaway: cleanText(raw.snippet || raw.title, 180) || raw.title,
  };
}

function toUniverseItem(raw, cfg, matcher) {
  if (isNoise(raw.title)) return null;
  const hit = matcher.match(`${raw.title} ${raw.snippet || ''}`);
  const url = raw.link;
  return {
    id: 'n' + sha1short(normalizeUrl(url)),
    ticker: cfg.ticker,
    company: cfg.label,
    sector: cfg.sector || '',
    scope: ['universe'],
    title: raw.title,
    url,
    source: raw.source || hostname(url),
    date: raw.date,
    topic: hit?.topic || 'Other',
    keyword: hit?.keyword || cfg.keyword,
    importance: 'medium',
    mood: 'neutral',
    takeaway: cleanText(raw.snippet || raw.title, 180) || raw.title,
  };
}

let munsLogged = false;
async function munshotNews(query) {
  if (!MUNS_TOKEN) return [];
  try {
    const res = await fetchWithTimeout(
      'https://fastapi.muns.io/tools/news-search',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${MUNS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query,
          country: 'INDIA',
          from_date: ymd(daysAgo(30)),
          to_date: ymd(new Date()),
        }),
      },
      25000,
    );
    const raw = await res.json();
    if (!munsLogged) {
      console.log('[munshot news] sample raw:', JSON.stringify(raw).slice(0, 500));
      munsLogged = true;
    }
    const arr = Array.isArray(raw)
      ? raw
      : raw.items || raw.data || raw.results || raw.news || raw.articles || [];
    return arr
      .map((x) => {
        const link = x.url || x.link || x.source_url;
        if (!link) return null;
        let d = new Date(x.date || x.published_at || x.pubDate || x.publishedAt || Date.now());
        if (isNaN(d.getTime())) d = new Date();
        return {
          title: stripHtml(x.title || x.headline || ''),
          link,
          date: d.toISOString(),
          source: x.source || x.publisher || hostname(link),
          snippet: stripHtml(x.snippet || x.summary || x.description || ''),
        };
      })
      .filter(Boolean);
  } catch (e) {
    console.log(`[munshot news] skip (${e.message})`);
    return [];
  }
}

function dedupeRun(items) {
  const byUrl = new Map();
  const titles = new Set();
  for (const it of items) {
    if (!it || !it.url) continue;
    const k = normalizeUrl(it.url);
    const tk = titleKey(it);
    if (byUrl.has(k) || titles.has(tk)) continue;
    byUrl.set(k, it);
    titles.add(tk);
  }
  return [...byUrl.values()];
}

async function main() {
  await maybeSetupProxy();

  const { all: companies } = loadCompanies();
  const keywords = loadKeywords();
  const matcher = buildKeywordMatcher(keywords);

  const existingEnv = readJSON(NEWS_PATH, { items: [] });
  // Prompt 1 shipped fabricated sample data; discard it on the first real run.
  const existing = existingEnv.source === 'sample' ? [] : existingEnv.items || [];
  if (existingEnv.source === 'sample') {
    console.log('[news] existing file is Prompt-1 sample — replacing with real data.');
  }

  console.log(`[news] ${companies.length} companies · ${(keywords.base || []).length} keywords · Munshot ${MUNS_TOKEN ? 'ON' : 'off'}`);

  /* ---- per-company pass ---- */
  const perCompany = await mapLimit(companies, 4, async (co) => {
    const out = [];
    try {
      const g = await googleNews(`"${co.company}" when:30d`);
      for (const raw of g) {
        const it = toNewsItem(raw, co, matcher);
        if (it) {
          out.push(it);
          stat.googleKept++;
        }
      }
    } catch (e) {
      stat.googleErrors++;
      console.log(`[google] ${co.company}: ${e.message}`);
    }
    if (MUNS_TOKEN) {
      const m = await munshotNews(co.company);
      for (const raw of m) {
        const it = toNewsItem(raw, co, matcher);
        if (it) {
          out.push(it);
          stat.munshotKept++;
        }
      }
    }
    // Optional Firecrawl bonus — portfolio names only, to bound credits.
    if (FIRECRAWL_API_KEY && co.scope.includes('portfolio')) {
      const f = await firecrawlNews(co, FIRECRAWL_API_KEY);
      for (const raw of f) {
        const it = toNewsItem(raw, co, matcher);
        if (it) {
          out.push(it);
          stat.firecrawlKept++;
        }
      }
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    return out.slice(0, PER_COMPANY_CAP);
  });

  let incoming = perCompany.flat().filter(Boolean);

  /* ---- universe pass (light, best-effort) ---- */
  for (const cfg of UNIVERSE) {
    try {
      const g = await googleNews(`${cfg.q} when:30d`);
      const kept = [];
      for (const raw of g) {
        const it = toUniverseItem(raw, cfg, matcher);
        if (it) kept.push(it);
      }
      kept.sort((a, b) => b.date.localeCompare(a.date));
      const take = kept.slice(0, UNIVERSE_PER_QUERY);
      incoming.push(...take);
      stat.universeKept += take.length;
    } catch (e) {
      console.log(`[universe] ${cfg.label}: ${e.message}`);
    }
  }

  /* ---- dedupe, resolve to publisher URLs, dedupe again ---- */
  incoming = dedupeRun(incoming);
  await mapLimit(incoming, 6, async (it) => {
    const resolved = await resolveUrl(it.url);
    it.url = resolved;
    it.id = 'n' + sha1short(normalizeUrl(resolved));
  });
  incoming = dedupeRun(incoming);

  const sourcesUsed = [];
  if (stat.googleKept > 0 || stat.universeKept > 0) sourcesUsed.push('google-news');
  if (stat.munshotKept > 0) sourcesUsed.push('munshot');
  if (stat.firecrawlKept > 0) sourcesUsed.push('firecrawl');

  console.log(
    `[news] kept — google:${stat.googleKept} munshot:${stat.munshotKept} firecrawl:${stat.firecrawlKept} universe:${stat.universeKept} · google errors:${stat.googleErrors} · unique incoming:${incoming.length}`,
  );

  if (incoming.length === 0) {
    console.log('[news] No items from any source — leaving news.json untouched.');
    return;
  }

  const merged = mergeItems(existing, incoming, { retentionDays: 45, cap: 500 });
  if (merged.items.length === 0) {
    console.log('[news] Nothing to write after merge — leaving file untouched.');
    return;
  }
  if (merged.added === 0 && merged.removed === 0) {
    console.log('[news] No new items and nothing aged out — leaving file untouched.');
    return;
  }

  const envelope = {
    generated_at: nowISO(),
    source: sourcesUsed.join('+') || 'google-news',
    counts: countsByScope(merged.items),
    items: merged.items,
  };
  writeJSON(NEWS_PATH, envelope);
  console.log(
    `[news] WROTE ${merged.items.length} items (+${merged.added} new, -${merged.removed} aged out) · ${JSON.stringify(envelope.counts)}`,
  );
}

main().catch((e) => {
  console.error('[news] fatal:', e);
  // Do not blank the file on a fatal error.
  process.exit(0);
});
