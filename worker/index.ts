/// <reference types="@cloudflare/workers-types" />

/**
 * Newsflow Cloudflare Worker.
 *
 * Prompt 1: the Worker simply serves the built static site (dist/) through the
 * ASSETS binding. It is wired as the Worker entry point (see wrangler.toml) so
 * that later prompts can mount /api/* routes here without changing deployment.
 *
 * TODO(Prompt 2): GET /api/news, /api/filings — serve scraper output.
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
