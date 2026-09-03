# Newsflow

A colourful, visual-first news dashboard for an Indian equity family office. It
surfaces only **fundamental business news** about the companies you track —
orders, capex, mergers, approvals, fraud, and so on — with day-to-day
share-price noise stripped out. Every story is source-backed with a real link.

> **Status: Prompt 3 of 4 — the Claude brain + live "add" boxes.**
> Real news is scraped (Google News + optional Munshot / Firecrawl), then a
> **Claude (Bedrock)** step decides keep/drop and assigns topic, mood,
> importance, and a plain one-line takeaway — junk (price moves, broker ratings,
> data/SEO pages) is dropped. The **add-keyword / add-stock** boxes now persist
> to **Cloudflare KV** via `/api/custom` and feed the next scrape.
> There is **no login** — the app opens straight to the dashboard.
> If no Bedrock key is set, everything still runs in a clean interim state
> (keyword-matched, neutral mood/medium importance). The morning email is Prompt 4.

---

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL — the dashboard loads immediately (no password).

| Script            | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server                           |
| `npm run build`   | Type-check + build the static site into `dist/`     |
| `npm run preview` | Preview the production build locally                |
| `npm run deploy`  | Build and deploy to Cloudflare Workers via wrangler |

## Tech stack

- **React 18 + TypeScript + Vite**, **Tailwind CSS 3**, **Recharts**, **lucide-react**
- **Cloudflare Workers** (via `wrangler`) serve the built site (`/api/*` reserved for later)
- **Node ESM scrapers** (`/scrapers`) using Google News RSS + `fast-xml-parser`

## What you can do in the dashboard

- **Three feeds** (top-bar toggle): **Portfolio** (holdings), **Watchlist**
  (holdings + exited + anything you add), **Universe** (keyword-led global
  discovery).
- **Pulse** — newsflow over 14 days, topic donut, "most in the news", mood.
- **Feed** — the news as filterable/sortable cards (topic, company, source,
  mood, importance, search).
- **Filings** — NSE/BSE announcements, filterable by company and exchange.
- **+ Add** — custom keywords and watchlist stocks (localStorage for now).

## The data pipeline (`/scrapers`)

GitHub Actions runs the scrapers on a schedule and commits fresh JSON back to
`main`; the dashboard then reads `public/data/news.json` and
`public/data/filings.json`.

The pipeline order is **news → enrich → filings** (then commit → auto-deploy):

```bash
cd scrapers
npm install
node news.mjs                 # gather candidates -> ../public/data/news.json
node enrich.mjs               # Claude keeps/drops + tags (no-op without a key)
node filings.mjs              # Munshot filings -> ../public/data/filings.json
ENRICH_MOCK=1 node enrich.mjs # test the enrich pipeline locally, no Bedrock key
```

**News (`news.mjs`)** — for each tracked company (portfolio + watchlist, plus
any custom stocks from KV) one lightweight query per source:

- **Google News RSS** — the free, no-key backbone (always works).
- **Munshot news-search** — supplement, only if `MUNS_TOKEN` is set.
- **Firecrawl** — optional bonus publisher pass, only if `FIRECRAWL_API_KEY` is set.

Recall over precision: it keeps every item that **mentions the company** and
isn't caught by the **noise / data-SEO blocklist** — a literal keyword is only a
_hint_ (topic guess), not a hard gate, so Claude can catch fundamentals that
don't use the exact word ("blaze at plant" → Trouble). A wider **Universe** pass
runs theme + custom-keyword queries (incl. R32-style global stories).
_Fallback with no Bedrock key:_ it reverts to requiring a literal keyword so the
interim feed stays clean.

**Enrich (`enrich.mjs`) — the brain.** Sends each new item to **Claude on Amazon
Bedrock** (raw HTTPS with a Bedrock API key — no AWS SDK/SigV4) and decides
KEEP vs DROP, then sets `topic` (1 of 6 buckets), `mood`, `importance`, and a
plain `takeaway` (≤140 chars). Junk (price moves, broker ratings, "stocks to
watch", TradingView/simplywall.st data pages, "market size/CAGR" SEO) is dropped.
Only unenriched items are processed (cheap); missing a key is a safe no-op.

**Filings (`filings.mjs`)** — the Munshot filings endpoint (needs `MUNS_TOKEN` +
`MUNS_EMAIL`), mapped to friendly categories. If unavailable, the committed
`filings.json` is left untouched (never blanked).

**Safety rules:** every item has a real source URL; results are de-duped and
merged into the existing file (accumulate, keep ~45 days); a run that produces
zero items never blanks the file; existing enriched items are never re-clobbered.

### Environment variables (all optional)

| Var                 | Enables                                                    |
| ------------------- | --------------------------------------------------------- |
| `BEDROCK_API_KEY`   | The Claude enrichment brain (Bedrock bearer token)        |
| `BEDROCK_MODEL_ID`  | The Claude model / inference-profile id (Haiku 4.5 rec.)  |
| `AWS_REGION`        | Bedrock region (defaults to `us-east-1`)                  |
| `NEWSFLOW_URL`      | Deployed site URL — lets the scraper read custom KV lists |
| `MUNS_TOKEN`        | Munshot news + filings                                    |
| `MUNS_EMAIL`        | Munshot filings (endpoint requires it)                    |
| `FIRECRAWL_API_KEY` | Firecrawl publisher pass (bonus)                          |

Google News needs no key, so the news scraper always produces data; without
`BEDROCK_*` the feed stays in the neutral interim state.

### Custom keywords / stocks (Cloudflare KV) — one-time setup

The add-boxes persist to KV via the Worker's `/api/custom` routes, and the
scraper merges them in. To turn it on **once** (then automatic forever):

```bash
npx wrangler kv namespace create NEWSFLOW_KV
```

Paste the printed id into the `[[kv_namespaces]]` block in `wrangler.toml` and
uncomment those three lines, then push. Add a `NEWSFLOW_URL` repo secret (your
deployed site URL) so the scraper reads the lists. Until configured, the boxes
fall back to `localStorage` and nothing breaks.

## Deployment (Cloudflare Workers Builds — connected repo, automated forever)

The repo is connected to **Cloudflare Workers Builds**, so **every push to
`main` auto-deploys** — no GitHub secrets and no manual steps for deployment:

- Cloudflare runs `npx wrangler deploy`; the `[build]` hook in `wrangler.toml`
  builds the site first (`npm run build` → `dist/`), so nothing needs to be set
  as a "build command" in the dashboard.
- The Worker `name` in `wrangler.toml` (`newstracker`) matches the Cloudflare
  project.
- **`.github/workflows/refresh-news.yml`** — weekday mornings (07:01 IST) + on
  demand: runs **news → enrich → filings**, commits refreshed JSON to `main`;
  that push is picked up by Workers Builds and deployed. Optional secrets (repo →
  Settings → Secrets → Actions) enrich the pipeline: `BEDROCK_API_KEY`,
  `BEDROCK_MODEL_ID`, `AWS_REGION`, `NEWSFLOW_URL`, `MUNS_TOKEN`, `MUNS_EMAIL`,
  `FIRECRAWL_API_KEY`. Without them, Google News still populates the dashboard.

To deploy manually: `npm run deploy` (after `wrangler login`).

## Project structure

```
public/data/
  companies.json     tracked companies (portfolio + exited watchlist)
  keywords.json      the 30 base keywords + 6-bucket mapping
  news.json          scraped, keyword-matched news (envelope: generated_at, source, counts, items)
  filings.json       NSE/BSE filings (Munshot; sample until MUNS_* is set)
scrapers/
  news.mjs           Google News + Munshot + Firecrawl -> news.json (recall gate)
  enrich.mjs         Claude (Bedrock) keep/drop + topic/mood/importance/takeaway
  filings.mjs        Munshot filings -> filings.json
  lib/util.mjs       fetch, RSS parse, keyword match, noise + data/SEO blocklist, merge
  lib/firecrawl.mjs  optional publisher pass
src/
  lib/               types, theme, data layer, metrics, storage, format, api (/api/custom)
  components/         TopBar, FeedToggle, Tabs, FilterBar, AddPanel, NewsCard, charts/, ui/
  pages/             Pulse.tsx, Feed.tsx, Filings.tsx
  App.tsx main.tsx index.css
worker/index.ts      Cloudflare Worker (serves dist/; /api/custom -> KV)
.github/workflows/   refresh-news.yml (scheduled scrape -> commit -> auto-deploy)
```

## Roadmap

- **Prompt 1:** full front-end on sample data. ✅
- **Prompt 2:** real scrapers → real `news.json` / `filings.json`; login removed. ✅
- **Prompt 3 (this):** Claude (Bedrock) enrichment — real noise-filter, topic,
  mood, importance, one-line takeaway; Cloudflare KV "memory" so custom
  keywords/stocks feed the scraper; wider Universe. ✅
- **Prompt 4:** a morning email digest.
