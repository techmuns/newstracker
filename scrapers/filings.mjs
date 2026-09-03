// Newsflow filings scraper (Prompt 2).
//
// Source: the Munshot filings endpoint (needs MUNS_TOKEN + MUNS_EMAIL). Maps
// each announcement to a friendly category and links to its source. If Munshot
// is unavailable OR the credentials are missing, the committed filings.json is
// left UNTOUCHED (never blanked) — direct NSE/BSE via Firecrawl can be added
// later. Writes public/data/filings.json in the existing shape.

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
  ymd,
} from './lib/util.mjs';

const MUNS_TOKEN = process.env.MUNS_TOKEN || '';
const MUNS_EMAIL = process.env.MUNS_EMAIL || '';

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

function normExchange(x) {
  const s = String(x || '');
  if (/bse/i.test(s)) return 'BSE';
  if (/nse/i.test(s)) return 'NSE';
  return s === 'BSE' || s === 'NSE' ? s : 'NSE';
}

let logged = false;
async function munshotFilings(company) {
  try {
    const res = await fetchWithTimeout(
      'https://fastapi.muns.io/filings',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${MUNS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ticker: company.ticker,
          company_name: company.company,
          start_date: ymd(daysAgo(45)),
          end_date: ymd(new Date()),
          email: MUNS_EMAIL,
        }),
      },
      25000,
    );
    const raw = await res.json();
    if (!logged) {
      console.log('[munshot filings] sample raw:', JSON.stringify(raw).slice(0, 500));
      logged = true;
    }
    const arr = Array.isArray(raw)
      ? raw
      : raw.filings || raw.items || raw.data || raw.results || raw.announcements || [];
    const out = [];
    for (const x of arr) {
      const url = x.url || x.attachment || x.link || x.pdf || x.file || x.attchmntFile;
      if (!url) continue; // never emit a filing without a source link
      const title = stripHtml(
        x.title || x.subject || x.headline || x.desc || x.description || x.category || 'Announcement',
      );
      let d = new Date(
        x.date || x.broadcast_date || x.an_dt || x.dt || x.exchdisstime || Date.now(),
      );
      if (isNaN(d.getTime())) d = new Date();
      const exchange = normExchange(x.exchange || x.exch);
      out.push({
        id: 'f' + sha1short(normalizeUrl(url)),
        ticker: company.ticker,
        company: company.company,
        exchange,
        date: d.toISOString(),
        category: friendlyCategory(x.type || x.category || x.subject, title),
        title,
        url,
      });
    }
    return out;
  } catch (e) {
    console.log(`[munshot filings] ${company.company}: ${e.message}`);
    return [];
  }
}

async function main() {
  await maybeSetupProxy();

  if (!MUNS_TOKEN || !MUNS_EMAIL) {
    console.log(
      '[filings] MUNS_TOKEN / MUNS_EMAIL not set — Munshot filings unavailable. Leaving filings.json untouched (Prompt 3+ / Firecrawl can add NSE/BSE directly).',
    );
    return;
  }

  const { all: companies } = loadCompanies();
  const existingEnv = readJSON(FILINGS_PATH, { items: [] });
  const existing = existingEnv.source === 'sample' ? [] : existingEnv.items || [];
  if (existingEnv.source === 'sample') {
    console.log('[filings] existing file is Prompt-1 sample — replacing with real data.');
  }

  console.log(`[filings] querying Munshot for ${companies.length} companies…`);
  const per = await mapLimit(companies, 4, (co) => munshotFilings(co));
  const incoming = per.flat().filter(Boolean);

  console.log(`[filings] Munshot returned ${incoming.length} filings.`);
  if (incoming.length === 0) {
    console.log('[filings] No filings produced — leaving filings.json untouched.');
    return;
  }

  const merged = mergeItems(existing, incoming, { retentionDays: 60, cap: 300 });
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
    source: 'munshot',
    counts: countsByExchange(merged.items),
    items: merged.items,
  };
  writeJSON(FILINGS_PATH, envelope);
  console.log(
    `[filings] WROTE ${merged.items.length} filings (+${merged.added} new, -${merged.removed} aged out) · ${JSON.stringify(envelope.counts)}`,
  );
}

main().catch((e) => {
  console.error('[filings] fatal:', e);
  process.exit(0); // never blank the file on error
});
