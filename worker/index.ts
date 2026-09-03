/// <reference types="@cloudflare/workers-types" />

/**
 * Newsflow Cloudflare Worker.
 *
 * Serves the built static site (dist/) via the ASSETS binding, and hosts the
 * /api/custom routes that back the dashboard's "add keyword / add stock" boxes
 * with a KV "memory" the scraper reads (Prompt 3).
 *
 * There is no login — the dashboard is open — so these write routes are open
 * too, which matches the client's "no login" decision.
 * TODO(security): protect the write routes with a shared-secret header
 * (e.g. `x-newsflow-secret`) checked here; not built now.
 *
 * TODO(Prompt 4): POST /api/digest — trigger / preview the morning email.
 */

export interface Env {
  ASSETS: Fetcher;
  NEWSFLOW_KV?: KVNamespace; // optional until the namespace id is set in wrangler.toml
}

const K_KEYWORDS = 'custom:keywords';
const K_STOCKS = 'custom:stocks';
const CAP = 200;

interface Stock {
  name: string;
  ticker?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function readList<T>(kv: KVNamespace, key: string): Promise<T[]> {
  try {
    const raw = await kv.get(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normStock(value: unknown): Stock | null {
  if (typeof value === 'string') {
    const name = value.trim();
    return name ? { name } : null;
  }
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const name = typeof v.name === 'string' ? v.name.trim() : '';
    const ticker = typeof v.ticker === 'string' ? v.ticker.trim() : '';
    if (!name && !ticker) return null;
    return ticker ? { name: name || ticker, ticker } : { name };
  }
  return null;
}

async function handleCustom(request: Request, env: Env): Promise<Response> {
  const kv = env.NEWSFLOW_KV;
  if (!kv) {
    // KV not configured yet — the front-end falls back to localStorage.
    if (request.method === 'GET') return json({ keywords: [], stocks: [] });
    return json({ ok: false, error: 'KV not configured' }, 503);
  }

  if (request.method === 'GET') {
    const [keywords, stocks] = await Promise.all([
      readList<string>(kv, K_KEYWORDS),
      readList<Stock>(kv, K_STOCKS),
    ]);
    return json({ keywords, stocks });
  }

  if (request.method === 'POST' || request.method === 'DELETE') {
    let body: { type?: string; value?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }
    const type = body?.type;

    if (type === 'keyword') {
      const value = typeof body.value === 'string' ? body.value.trim() : '';
      if (!value) return json({ ok: false, error: 'Empty keyword' }, 400);
      let list = await readList<string>(kv, K_KEYWORDS);
      if (request.method === 'POST') {
        if (!list.some((k) => k.toLowerCase() === value.toLowerCase())) list.push(value);
        list = list.slice(0, CAP);
      } else {
        list = list.filter((k) => k.toLowerCase() !== value.toLowerCase());
      }
      await kv.put(K_KEYWORDS, JSON.stringify(list));
      return json({ ok: true, keywords: list });
    }

    if (type === 'stock') {
      const s = normStock(body.value);
      if (!s) return json({ ok: false, error: 'Empty stock' }, 400);
      let list = await readList<Stock>(kv, K_STOCKS);
      const sameAs = (a: Stock, b: Stock) =>
        (a.ticker && b.ticker && a.ticker.toLowerCase() === b.ticker.toLowerCase()) ||
        a.name.toLowerCase() === b.name.toLowerCase();
      if (request.method === 'POST') {
        if (!list.some((x) => sameAs(x, s))) list.push(s);
        list = list.slice(0, CAP);
      } else {
        list = list.filter((x) => !sameAs(x, s));
      }
      await kv.put(K_STOCKS, JSON.stringify(list));
      return json({ ok: true, stocks: list });
    }

    return json({ ok: false, error: 'Unknown type (expected "keyword" or "stock")' }, 400);
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/custom') {
      return handleCustom(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'Not found', path: url.pathname }, 404);
    }

    // Everything else is the static dashboard (SPA fallback via wrangler.toml).
    return env.ASSETS.fetch(request);
  },
};
