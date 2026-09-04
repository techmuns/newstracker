// Newsflow filings scraper — REAL NSE corporate announcements via Firecrawl.
//
// Primary source: NSE's corporate-announcements API, fetched through Firecrawl
// (rawHtml mode, IN proxy) because direct/scrape.do access is blocked. Fallback:
// Screener.in company page via Firecrawl JSON mode, keeping only items that link
// to a real BSE/NSE filing or PDF. Every item MUST carry a real source URL.
//
// HONESTY GUARDS (never serve placeholders):
//  - only a real ('nse') envelope on disk is trusted as existing data to merge
//    onto; 'sample'/'pending'/anything else is treated as empty;
//  - an item with no source URL is dropped;
//  - the file is written ONLY when there are real incoming filings;
//  - on error/empty the committed file is left UNTOUCHED.

import {
  maybeSetupProxy,
  readJSON,
  writeJSON,
  FILINGS_PATH,
  loadCompanies,
  fetchWithTimeout,
  mapLimit,
  mergeItems,
  countsByExchange,
  normalizeUrl,
  sha1short,
  stripHtml,
  nowISO,
  daysAgo,
} from './lib/util.mjs';

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/scrape';

const CATEGORY_RULES = [
  [/board meeting/i, 'Board Meeting'],
  [/receipt of order|order (win|book|bagg)|awarded|contract|work order|letter of (award|intent)/i, 'Receipt of Order'],
  [/allot|qip|qualified institutional|preferential|rights issue|securities|fund ?rais/i, 'Allotment of Securities'],
  [/buy-?back/i, 'Buyback'],
  [/dividend/i, 'Dividend'],
  [/acquisition|acqui|stake|merger|amalgamation|scheme of arrangement|joint venture/i, 'Acquisition'],
  [/financial results|un-?audited|quarterly results|q[1-4] (fy)?|results for the quarter/i, 'Financial Results'],
  [/investor|analyst|conference call|earnings call|presentation/i, 'Investor Presentation'],
  [/resignation|appointment|cessation|director|kmp|key managerial|change in (management|director)/i, 'Change in Directors'],
  [/credit rating|rating (action|revision|upgrade|downgrade)/i, 'Credit Rating'],
  [/trading window/i, 'Trading Window'],
  [/newspaper (publication|advertisement)/i, 'Newspaper Publication'],
  [/fire|accident|incident|reg\.? ?30|material event|disclosure/i, 'Disclosure'],
];

function friendlyCategory(type, title) {
  const s = `${type || ''} ${title || ''}`;
  for (const [re, label] of CATEGORY_RULES) if (re.test(s)) return label;
  return type ? String(type).trim() : 'Announcement';
}

function ddmmyyyy(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// NSE dates arrive as "05-Sep-2026 18:30:00" or ISO-ish; parse robustly, else now.
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseFilingDate(s) {
  if (!s) return new Date();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const m = String(s).match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m && MONTHS[m[2].toLowerCase()] != null) {
    return new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  }
  return new Date();
}

// Firecrawl responses for JSON endpoints may arrive as rawHtml wrapped in <pre>,
// or a markdown code fence. Pull out the clean JSON text.
function extractJsonText(content) {
  let t = String(content || '').replace(/<[^>]*>/g, '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  return t;
}

let fcLogged = false;
let lastFc = { status: 0, snippet: '' };

// Raw-HTML scrape via Firecrawl. Returns the page text (rawHtml or markdown).
async function firecrawlRaw(url) {
  const res = await fetchWithTimeout(
    FIRECRAWL_URL,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${FIRECRAWL_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        url,
        formats: ['rawHtml'],
        onlyMainContent: false,
        location: { country: 'IN' },
        proxy: 'auto',
        waitFor: 2500,
      }),
    },
    35000,
  );
  const raw = await res.json().catch(() => ({}));
  lastFc = { status: res.status, snippet: JSON.stringify(raw).slice(0, 300) };
  if (!fcLogged) {
    console.log('[firecrawl] sample raw:', JSON.stringify(raw).slice(0, 400));
    fcLogged = true;
  }
  return raw?.data?.rawHtml || raw?.data?.markdown || '';
}

// PRIMARY: NSE corporate-announcements for one symbol (equities, retry as sme).
// Returns { items, challenged } — challenged=true means NSE gave a non-JSON /
// anti-bot page, so the Screener fallback should be tried.
async function nseFilings(company) {
  const from = ddmmyyyy(daysAgo(90));
  const to = ddmmyyyy(new Date());
  for (const index of ['equities', 'sme']) {
    const url = `https://www.nseindia.com/api/corporate-announcements?index=${index}&symbol=${encodeURIComponent(
      company.ticker,
    )}&from_date=${from}&to_date=${to}`;
    let content;
    try {
      content = await firecrawlRaw(url);
    } catch (e) {
      console.log(`[filings] NSE ${company.ticker} (${index}): ${e.message}`);
      return { items: [], challenged: true }; // couldn't fetch → let Screener try
    }
    let parsed;
    try {
      parsed = JSON.parse(extractJsonText(content));
    } catch {
      return { items: [], challenged: true }; // challenge / non-JSON page
    }
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
    const items = [];
    for (const x of arr) {
      const src = x.attchmntFile; // the actual announcement PDF
      if (!src) continue; // no source link → never emit
      const desc = stripHtml(x.desc || '');
      items.push({
        id: 'f' + sha1short(normalizeUrl(src)),
        ticker: company.ticker,
        company: company.company,
        exchange: 'NSE',
        date: parseFilingDate(x.an_dt || x.sort_date || x.dt).toISOString(),
        category: friendlyCategory(desc),
        title: stripHtml(x.attchmntText || x.desc || 'Announcement'),
        url: src,
      });
    }
    if (items.length > 0) return { items, challenged: false };
    // equities empty → loop retries once with index=sme
  }
  return { items: [], challenged: false }; // parsed cleanly but genuinely nothing
}

const SCREENER_SCHEMA = {
  type: 'object',
  properties: {
    announcements: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, url: { type: 'string' }, date: { type: 'string' } },
        required: ['title', 'url'],
      },
    },
  },
  required: ['announcements'],
};

// FALLBACK: Screener company page via Firecrawl JSON mode. Keeps ONLY items whose
// url is a real filing (bseindia / nseindia host, or a .pdf).
async function screenerFilings(company) {
  try {
    const res = await fetchWithTimeout(
      FIRECRAWL_URL,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${FIRECRAWL_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          url: `https://www.screener.in/company/${encodeURIComponent(company.ticker)}/`,
          formats: ['json'],
          onlyMainContent: false,
          location: { country: 'IN' },
          jsonOptions: {
            schema: SCREENER_SCHEMA,
            prompt: `Extract the recent corporate announcements for ${company.company} with their document URLs and dates. Only include items that link to an official filing document (a BSE/NSE announcement or a PDF).`,
          },
        }),
      },
      35000,
    );
    const raw = await res.json().catch(() => ({}));
    lastFc = { status: res.status, snippet: JSON.stringify(raw).slice(0, 300) };
    const anns = raw?.data?.json?.announcements || raw?.json?.announcements || [];
    const items = [];
    for (const a of anns) {
      const src = a?.url || '';
      const real = /(bseindia|nseindia)/i.test(src) || /\.pdf($|\?)/i.test(src);
      if (!src || !real) continue; // only genuine filing links
      items.push({
        id: 'f' + sha1short(normalizeUrl(src)),
        ticker: company.ticker,
        company: company.company,
        exchange: /bseindia/i.test(src) ? 'BSE' : 'NSE',
        date: parseFilingDate(a.date).toISOString(),
        category: friendlyCategory(a.title || ''),
        title: stripHtml(a.title || 'Announcement'),
        url: src,
      });
    }
    return items;
  } catch (e) {
    console.log(`[filings] Screener ${company.ticker}: ${e.message}`);
    return [];
  }
}

async function main() {
  await maybeSetupProxy();

  if (!FIRECRAWL_API_KEY) {
    console.log('[filings] FIRECRAWL_API_KEY not set — cannot fetch real filings. Leaving filings.json untouched.');
    return;
  }

  const { all: companies } = loadCompanies();
  const existingEnv = readJSON(FILINGS_PATH, { items: [] });
  // Trust ONLY a previously-written real ('nse') envelope as existing data.
  const existing = existingEnv.source === 'nse' ? existingEnv.items || [] : [];
  if (existingEnv.source && existingEnv.source !== 'nse') {
    console.log(
      `[filings] existing file is non-real ('${existingEnv.source}') — ignoring it; only verified NSE/BSE filings are ever written.`,
    );
  }

  console.log(`[filings] fetching NSE announcements via Firecrawl for ${companies.length} companies…`);
  let challenged = 0;
  let fallbackHits = 0;
  const per = await mapLimit(companies, 3, async (co) => {
    const primary = await nseFilings(co);
    if (primary.items.length > 0) return primary.items;
    if (primary.challenged) {
      challenged++;
      const fb = await screenerFilings(co);
      if (fb.length) fallbackHits++;
      return fb;
    }
    return [];
  });
  const incoming = per.flat().filter(Boolean);

  console.log(
    `[filings] collected ${incoming.length} real filings (NSE challenged for ${challenged} symbols, Screener recovered ${fallbackHits}).`,
  );
  if (incoming.length === 0) {
    console.log(
      `[filings] No real filings produced — leaving filings.json untouched. Last Firecrawl: HTTP ${lastFc.status} · ${lastFc.snippet}`,
    );
    return;
  }

  const merged = mergeItems(existing, incoming, { retentionDays: 100, cap: 400 });
  if (merged.items.length === 0) {
    console.log('[filings] Nothing to write after merge — leaving file untouched.');
    return;
  }
  if (merged.added === 0 && merged.removed === 0) {
    console.log('[filings] No new filings and nothing aged out — leaving file untouched.');
    return;
  }

  const envelope = {
    generated_at: nowISO(),
    source: 'nse',
    counts: countsByExchange(merged.items),
    items: merged.items,
  };
  writeJSON(FILINGS_PATH, envelope);
  console.log(
    `[filings] WROTE ${merged.items.length} filings (+${merged.added} new, -${merged.removed} aged out) · ${JSON.stringify(envelope.counts)}`,
  );
  for (const it of merged.items.slice(0, 3)) {
    console.log(`   e.g. ${it.company} · ${it.category} · ${it.url}`);
  }
}

main().catch((e) => {
  console.error('[filings] fatal:', e);
  process.exit(0); // never blank the file on error
});
