# Newsflow

A colourful, visual-first news dashboard for an Indian equity family office. It
surfaces only **fundamental business news** about the companies you track —
orders, capex, mergers, approvals, fraud, and so on — with day-to-day
share-price noise stripped out. Every story is source-backed with a real link.

> **Status: Prompt 2 of 4 — real data pipeline.**
> The dashboard now runs on **real** news scraped from Google News (plus
> optional Munshot / Firecrawl), written into the same JSON shapes the UI reads.
> There is **no login** — the app opens straight to the dashboard.
> The AI noise-filter / mood / importance / one-line takeaway (Claude) and the
> Cloudflare KV "add keyword" wiring arrive in Prompt 3.

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

```bash
cd scrapers
npm install
node news.mjs      # writes ../public/data/news.json
node filings.mjs   # writes ../public/data/filings.json
```

**News** — for each tracked company (portfolio + watchlist) one lightweight
query per source:

- **Google News RSS** — the free, no-key backbone (always works).
- **Munshot news-search** — supplement, only if `MUNS_TOKEN` is set.
- **Firecrawl** — optional bonus publisher pass, only if `FIRECRAWL_API_KEY` is set.

Every result is **keyword-matched** against `keywords.json` (the fundamental
filter → sets `keyword` + `topic`), passed through a **conservative price-noise
filter**, and checked for a **company-name mention** (Google's phrase search is
fuzzy). A light **Universe** pass runs a few company-agnostic theme queries
(e.g. R32 refrigerant, defence exports). `mood`/`importance` are safe defaults
(`neutral`/`medium`) and `takeaway` falls back to the headline — **Claude fills
these in for real in Prompt 3.**

**Filings** — the Munshot filings endpoint (needs `MUNS_TOKEN` + `MUNS_EMAIL`),
mapped to friendly categories. If unavailable, the committed `filings.json` is
left untouched (never blanked).

**Safety rules:** every item has a real source URL; results are de-duped and
merged into the existing file (accumulate, keep ~45 days); a run that produces
zero items never blanks the file.

### Environment variables (all optional)

| Var                 | Enables                                   |
| ------------------- | ----------------------------------------- |
| `MUNS_TOKEN`        | Munshot news + filings                    |
| `MUNS_EMAIL`        | Munshot filings (endpoint requires it)    |
| `FIRECRAWL_API_KEY` | Firecrawl publisher pass (bonus)          |

Google News needs no key, so the news scraper always produces data.

## Deployment (Cloudflare Workers Builds — connected repo, automated forever)

The repo is connected to **Cloudflare Workers Builds**, so **every push to
`main` auto-deploys** — no GitHub secrets and no manual steps for deployment:

- Cloudflare runs `npx wrangler deploy`; the `[build]` hook in `wrangler.toml`
  builds the site first (`npm run build` → `dist/`), so nothing needs to be set
  as a "build command" in the dashboard.
- The Worker `name` in `wrangler.toml` (`newstracker`) matches the Cloudflare
  project.
- **`.github/workflows/refresh-news.yml`** — weekday mornings (07:01 IST) + on
  demand: runs the scrapers and commits refreshed JSON to `main`; that push is
  picked up by Workers Builds and deployed. Optional scraper secrets enrich the
  sources (repo → Settings → Secrets → Actions): `MUNS_TOKEN`, `MUNS_EMAIL`,
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
  news.mjs           Google News + Munshot + Firecrawl -> news.json
  filings.mjs        Munshot filings -> filings.json
  lib/util.mjs       fetch, RSS parse, keyword match, noise filter, merge/dedupe
  lib/firecrawl.mjs  optional publisher pass
src/
  lib/               types, theme, data layer, metrics, storage, format
  components/         TopBar, FeedToggle, Tabs, FilterBar, AddPanel, NewsCard, charts/, ui/
  pages/             Pulse.tsx, Feed.tsx, Filings.tsx
  App.tsx main.tsx index.css
worker/index.ts      Cloudflare Worker (serves dist/; /api/* reserved)
.github/workflows/   refresh-news.yml (scheduled scrape -> commit -> auto-deploy)
```

## Roadmap

- **Prompt 1:** full front-end on sample data. ✅
- **Prompt 2 (this):** real scrapers → real `news.json` / `filings.json`; login removed. ✅
- **Prompt 3:** a Claude (Bedrock) step doing the real noise-filter, topic
  confidence, mood, importance, and one-line takeaway; Cloudflare KV "memory"
  so custom keywords/stocks feed the scraper; full Universe.
- **Prompt 4:** a morning email digest.
