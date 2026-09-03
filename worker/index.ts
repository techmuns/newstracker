/// <reference types="@cloudflare/workers-types" />

/**
 * Newsflow Cloudflare Worker.
 *
 * The Worker serves the built static site (dist/) through the ASSETS binding.
 * There is no login/auth — the dashboard is open. News + filings are committed
 * as static JSON by the GitHub Actions scrapers (see /scrapers), so no API is
 * needed to read them; the /api/* stub below is reserved for later prompts.
 *
 * TODO(Prompt 3): GET/POST /api/keywords, /api/watchlist — KV-backed "memory".
 * TODO(Prompt 4): POST /api/digest — trigger / preview the morning email.
 */

export interface Env {
  ASSETS: Fetcher;
  // TODO(Prompt 3): NEWSFLOW_KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // Placeholder until the API is built in Prompts 2–4.
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'API not implemented yet — coming in Prompt 2+.',
          path: url.pathname,
        }),
        {
          status: 501,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        },
      );
    }

    // Everything else is the static dashboard (SPA fallback handled by
    // not_found_handling in wrangler.toml).
    return env.ASSETS.fetch(request);
  },
};
