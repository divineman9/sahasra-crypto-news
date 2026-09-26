'use strict';

// Phase 3 step 7: Reddit Social tab, one adapter per subreddit in config.REDDIT_SUBS. Disabled
// (make() returns no adapters) unless REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET/REDDIT_USERNAME/
// REDDIT_PASSWORD are all set — a free Reddit "script" app (https://www.reddit.com/prefs/apps),
// authenticated via OAuth's "password" grant (the only free flow with a workable ~100 QPM limit;
// unauthenticated .rss/.json are ~1 req/min or 403). One access token is fetched and cached
// module-wide (`cachedToken`) and shared across every subreddit adapter — sub-adapters never each
// hold their own token/expiry.
//
// kind 'social', tier 4, alertable:false, maxImportance:10 (never a chip, never a Discord alert —
// same withCap()/store.js guarantee as youtube.js). hintTickers is always [] — the title tagger
// (tickers.js) runs on the raw Reddit title like any other untagged source.

const http = require('../http');
const { REDDIT_SUBS } = require('../config');

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REFRESH_SKEW_MS = 60000; // treat the token as expired 60s before Reddit says it is
const INTERVAL_MS = 5 * 60000;
const FORTY_EIGHT_H = 48 * 3600000;
const NEWS_FLAIR_RE = /news|breaking/i;

function env() {
  return {
    clientId: process.env.REDDIT_CLIENT_ID || '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
    username: process.env.REDDIT_USERNAME || '',
    password: process.env.REDDIT_PASSWORD || '',
    userAgent: process.env.REDDIT_USER_AGENT || '',
  };
}

function isConfigured(e = env()) {
  return !!(e.clientId && e.clientSecret && e.username && e.password);
}

function userAgentFor(e) {
  return e.userAgent || 'SahasraNews/1.0 (by u/' + e.username + ')';
}

// Module-wide token cache, shared by every subreddit adapter (one script-app login for all of
// them). `tokenPromise` collapses concurrent callers into a single in-flight token fetch.
let cachedToken = null; // { accessToken, expiresAt }
let tokenPromise = null;

async function fetchToken(e) {
  const auth = Buffer.from(e.clientId + ':' + e.clientSecret).toString('base64');
  const body = 'grant_type=password&username=' + encodeURIComponent(e.username) + '&password=' + encodeURIComponent(e.password);
  const res = await http.request(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    ua: userAgentFor(e),
    timeoutMs: 15000,
  });
  const json = res.json();
  if (!json || !json.access_token) {
    // F6 (step 7 fix round): surface Reddit's own (non-secret) error code — e.g. "invalid_grant"
    // for a bad password or an account with 2FA enabled that needs "password:otp" instead — never
    // the credentials themselves.
    const errCode = json && json.error ? json.error : 'no access_token in response';
    throw new Error('reddit: token request failed (' + errCode + ')');
  }
  const expiresAt = Date.now() + (Number(json.expires_in) || 3600) * 1000;
  cachedToken = { accessToken: json.access_token, expiresAt };
  return cachedToken.accessToken;
}

// F5 (step 7 fix round): a concurrent fetch (forced or not) is always collapsed into the single
// in-flight `tokenPromise` — the earlier version only did this for non-forced calls, so N
// adapters hitting a 401 at once could each fire their own forced-refresh POST. A rejected fetch
// clears `tokenPromise` (via .finally below) without ever populating `cachedToken`, so a failed
// attempt is never cached and the next call retries cleanly.
async function getToken({ force = false } = {}) {
  const e = env();
  if (!force && cachedToken && cachedToken.expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return cachedToken.accessToken;
  }
  if (tokenPromise) return tokenPromise;
  const p = fetchToken(e).finally(() => {
    if (tokenPromise === p) tokenPromise = null;
  });
  tokenPromise = p;
  return p;
}

// GET a subreddit's /hot listing. On a 401 (expired/invalid token, e.g. another process rotated
// it): if `cachedToken` has already moved on from the token this request used (another adapter's
// concurrent refresh beat us to it), reuse that newer token instead of forcing yet another POST
// (F5) — otherwise force exactly one refresh and retry once. A second 401 propagates as-is (the
// scheduler's normal HttpError-driven backoff handles it, same as any other adapter's
// auth/rate-limit failure) — including a non-401 error (e.g. 429), which is never intercepted
// here and propagates with its original status/retryAfterMs untouched.
async function fetchHot(sub, e) {
  const url = 'https://oauth.reddit.com/r/' + sub + '/hot?limit=50&raw_json=1';
  const token = await getToken();
  try {
    const res = await http.request(url, { headers: { Authorization: 'Bearer ' + token }, ua: userAgentFor(e), timeoutMs: 15000 });
    return res.json();
  } catch (err) {
    if (!err || err.status !== 401) throw err;
    const freshToken = (cachedToken && cachedToken.accessToken && cachedToken.accessToken !== token)
      ? cachedToken.accessToken
      : await getToken({ force: true });
    const res2 = await http.request(url, { headers: { Authorization: 'Bearer ' + freshToken }, ua: userAgentFor(e), timeoutMs: 15000 });
    return res2.json();
  }
}

function makeSubAdapter(cfg) {
  const sub = cfg.sub;
  const minScore = cfg.minScore;
  const name = 'reddit:' + sub;

  async function run() {
    const e = env();
    const json = await fetchHot(sub, e);
    const children = json && json.data && Array.isArray(json.data.children) ? json.data.children : [];
    const cutoff = Date.now() - FORTY_EIGHT_H;
    const items = [];
    for (const c of children) {
      const d = c && c.data;
      if (!d) continue;
      if (d.stickied) continue;
      if (d.over_18) continue;
      // F4 (step 7 fix round): a moderator/automod-removed or author-deleted post has nothing
      // worth showing (title/permalink survive removal, but the content behind them is gone).
      if (d.removed_by_category) continue;
      if (d.author === '[deleted]') continue;
      if (d.selftext === '[removed]' || d.selftext === '[deleted]') continue;
      const publishedAt = new Date((Number(d.created_utc) || 0) * 1000);
      if (isNaN(publishedAt.getTime()) || publishedAt.getTime() < cutoff) continue;
      const score = Number(d.score) || 0;
      const flair = String(d.link_flair_text || '');
      if (!(score >= minScore || NEWS_FLAIR_RE.test(flair))) continue;
      const title = String(d.title || '').trim();
      const permalink = String(d.permalink || '');
      if (!title || !permalink) continue;
      items.push({
        sourceName: name,
        sourceTier: 4,
        kind: 'social',
        exchange: null,
        title,
        url: 'https://www.reddit.com' + permalink,
        publishedAt,
        hintCategory: null,
        hintTickers: [],
        sourceDomain: 'reddit.com',
        alertable: false,
        maxImportance: 10,
      });
    }
    return items;
  }

  return { name, tier: 4, intervalMs: INTERVAL_MS, run };
}

let disabledLogged = false;

function make(subs = REDDIT_SUBS) {
  if (!isConfigured()) {
    if (!disabledLogged) {
      disabledLogged = true;
      console.log('[reddit] disabled — set REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD in app/.env (free "script" app at https://www.reddit.com/prefs/apps)');
    }
    return [];
  }
  return (subs || []).map(makeSubAdapter);
}

module.exports = { make, makeSubAdapter, isConfigured, getToken, fetchToken, fetchHot, userAgentFor };
