// Valuepickr forum source (Prompt 4). Queries the Valuepickr Discourse forum's
// JSON search for each tracked company and returns raw items in the same shape
// as googleNews(). Best-effort + non-fatal — Valuepickr chatter is often opinion,
// so these flow through the same pipeline and Claude (enrich.mjs) keeps only the
// genuinely fundamental threads. valuepickr.com is a REAL source (not blocklisted).

import { fetchWithTimeout, stripHtml, ymd, daysAgo } from './util.mjs';

const BASE = 'https://forum.valuepickr.com';
// A realistic browser UA — be a good citizen (small concurrency upstream, short timeout).
const VP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function valuepickrSearch(company, sinceDate = ymd(daysAgo(90))) {
  const q = `"${company}" after:${sinceDate}`;
  const url = `${BASE}/search.json?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetchWithTimeout(url, { headers: { 'user-agent': VP_UA, accept: 'application/json' } }, 12000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const topics = new Map();
    for (const t of data.topics || []) topics.set(t.id, t);

    const out = [];
    const seen = new Set();
    for (const p of data.posts || []) {
      const t = topics.get(p.topic_id);
      if (!t || seen.has(p.topic_id)) continue; // one item per thread (newest post)
      seen.add(p.topic_id);
      const slug = t.slug || 'topic';
      let d = new Date(p.created_at || t.last_posted_at || t.created_at || Date.now());
      if (isNaN(d.getTime())) d = new Date();
      out.push({
        title: stripHtml(t.title || t.fancy_title || ''),
        link: `${BASE}/t/${slug}/${t.id}`,
        date: d.toISOString(),
        source: 'Valuepickr',
        snippet: stripHtml(p.blurb || ''),
      });
    }
    return out;
  } catch (e) {
    console.log(`[valuepickr] ${company}: ${e.message}`);
    return [];
  }
}
