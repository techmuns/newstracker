# Newsflow

A colourful, visual-first news dashboard for an Indian equity family office. It
surfaces only **fundamental business news** about the companies you track —
orders, capex, mergers, approvals, fraud, and so on — with day-to-day
share-price noise stripped out. Every story is source-backed with a real link.

> **Status: Prompt 1 of 4 — UI skeleton on sample data.**
> This build is the complete front-end running on realistic **sample** JSON.
> No scrapers, no AI, no email yet — those arrive in Prompts 2–4 and drop into
> the data shapes already defined here.

---

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL, enter the demo password **`newsflow`**, and explore.

| Script            | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server                           |
| `npm run build`   | Type-check + build the static site into `dist/`     |
| `npm run preview` | Preview the production build locally                |
| `npm run deploy`  | Build and deploy to Cloudflare Workers via wrangler |

## Tech stack

- **React 18 + TypeScript + Vite**
- **Tailwind CSS 3** for styling
- **Recharts** for every chart
- **lucide-react** for every icon
- **Cloudflare Workers** (via `wrangler`) serve the built site and will host
  `/api/*` routes in later prompts

## What you can do in the dashboard

- **Three feeds** (segmented toggle in the top bar):
  - **Portfolio** — current holdings
  - **Watchlist** — holdings, exited names, and anything you add
  - **Universe** — keyword-led discovery beyond your companies (e.g. a global
    "R32 refrigerant / US anti-dumping duty" story)
- **Pulse tab** — visuals you can read in 3 seconds: newsflow over time, a
  topic breakdown donut, "most in the news" companies, a mood split, and a
  strip of the day's biggest stories. Every chart has a styled hover tooltip
  and a legend.
- **Feed tab** — the actual news as clean cards, with filters (topic, company,
  source, mood, importance), a search box, and a newest / most-important sort.
- **Filings tab** — NSE/BSE corporate announcements in a filterable, sortable
  list.
- **+ Add panel** — add custom keywords and watchlist stocks; both persist to
  `localStorage` and show as removable chips.

## Colour system (topic buckets)

| Bucket           | Colour  | Example keywords                              |
| ---------------- | ------- | --------------------------------------------- |
| **Growth**       | emerald | Capacity Expansion, Capex, Commissioning      |
| **Orders**       | blue    | Order, Orderbook, Receipt of Order            |
| **Deals**        | violet  | JV, Partnership, Stake sale, Merger           |
| **Money**        | amber   | QIP, Rights Issue, Buyback, Earnings          |
| **Approvals&IP** | teal    | Patent, Approval                              |
| **Trouble**      | rose    | Fraud, Lawsuit, Resignation, Fire, Downgrade  |
| **Other**        | slate   | keyword-led Universe items that don't fit above |

Mood: **positive** (emerald) · **neutral** (slate) · **negative** (rose).

## Project structure

```
public/data/
  companies.json     tracked companies (portfolio + exited watchlist)
  keywords.json      the 30 base keywords + 6-bucket mapping
  news.json          SAMPLE tagged news (~45 items)
  filings.json       SAMPLE NSE/BSE filings (~12 items)
src/
  lib/
    types.ts         all TypeScript types (final shapes)
    theme.ts         colour tokens, topic + mood styling
    data.ts          the ONE data layer (swap sample -> API later)
    metrics.ts       pure aggregations for the Pulse charts
    format.ts        IST date formatting helpers
    storage.ts       localStorage read/write (custom keywords + watchlist)
  components/        TopBar, FeedToggle, Tabs, FilterBar, AddPanel, NewsCard,
                     Login, charts/, ui/
  pages/             Pulse.tsx, Feed.tsx, Filings.tsx
  App.tsx main.tsx index.css
worker/index.ts      Cloudflare Worker (serves dist/ now; /api/* later)
.github/workflows/deploy.yml   auto-deploy on push to main
wrangler.toml
```

## Deployment (set up once, automated forever)

Every push to `main` builds the site and deploys it to Cloudflare Workers via
GitHub Actions (`.github/workflows/deploy.yml`).

**One-time setup by the repo owner** — add two GitHub Actions secrets
(_Settings → Secrets and variables → Actions_):

- `CLOUDFLARE_API_TOKEN` — a token with the **Edit Cloudflare Workers** permission
- `CLOUDFLARE_ACCOUNT_ID` — from your Cloudflare dashboard home

After that, no manual steps are ever needed — merge to `main` and it ships.

To deploy manually instead:

```bash
npm run deploy
```

## Data model

All four JSON files use the **final** shapes (see `src/lib/types.ts`). Sample
data now; real scraper/AI output drops into the same structures later. Custom
keywords and added watchlist stocks currently live in `localStorage`, behind
small functions in `src/lib/storage.ts`.

> `// TODO(Prompt 3): move custom keywords + watchlist to a Cloudflare Worker + KV`
> so the scraper can read them.

## Roadmap

- **Prompt 1 (this):** full front-end on sample data. ✅
- **Prompt 2:** scrapers that write real `news.json` / `filings.json`.
- **Prompt 3:** a Claude filtering step + a Cloudflare KV "memory" for custom
  keywords and watchlist stocks.
- **Prompt 4:** a morning email digest, plus a hardened auth gate.
