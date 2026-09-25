'use strict';

// Official project sources (Phase 3 step 6): one adapter per entry in officialSources.json.
//   github -> GitHub releases Atom feed, stable releases only, interval 30 min
//   forum  -> Discourse governance forum latest.rss, governance-looking topics only, interval 30 min, alertable:false
//   blog   -> plain project-blog RSS, interval 30 min
//
// Unverified sources (verified:false, i.e. not yet confirmed live by the operator) are marked
// `quietHealth: true` on the returned adapter. scheduler.js reads that flag itself (in
// _backoffUntil) to back a persistently-failing one off to <=1/6h once it has failed
// `quietFailThreshold` (default 6) times in a row; health.js reads the same flag only to suppress
// Discord health alerts for it (log-only) — see the Phase 3 step 6 fix-round review (B1) for why
// the once-per-6h policy itself must live in the scheduler and not be re-derived from a
// health-check-side timer (a race between the two backoff computations could undo it for hours).

const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser').Parser || require('rss-parser');
const { request } = require('../http');

const SOURCES_FILE = path.join(__dirname, '..', 'officialSources.json');
const INTERVAL_MS = 30 * 60000;
const SEVEN_D = 7 * 86400000;
const MAX_ITEMS = 20;

// Applied to the release TAG (short, machine-generated version string: "v1.3.0-rc1", "nightly").
// Anchored on non-letter boundaries rather than \b so that /i's case-folding of the character
// class also excludes uppercase (F4, fix round): a marker glued onto a version number still
// matches ("v1.3.0-rc1"), but a marker that's merely a substring of an unrelated word doesn't
// ("source-1.0", "arch-v1.2", "latest" all keep).
const TAG_UNSTABLE_RE = /(^|[^a-z])(rc\d*|beta|alpha|pre(view|release)?|nightly|test(net|ing)?|dev(net)?)([^a-z]|$)/i;
// Applied to the release TITLE (free text, can legitimately contain "prepare"/"predictive"/etc.)
// with word boundaries so normal prose doesn't get caught; also catches the spelled-out
// "Release Candidate" (F4, fix round).
const TITLE_UNSTABLE_RE = /\b(rc\d*|release candidates?|beta|alpha|pre(view|release)?|nightly|test(net|ing)?|dev(net)?)\b/i;

// F3 (fix round): every term \b-bounded so e.g. "AIP" can't substring-match inside "Taipei", or
// "vote" inside "Devoted", or "grant" inside "Immigrant". The old generic `\[.*\]` (any brackets
// anywhere) is replaced with `^\[[^\]]+\]` — only a LEADING bracketed tag counts ("[ARFC] ..."),
// not one appearing later in an otherwise off-topic title ("Introduce yourself [new members]").
const GOVERNANCE_RE = /\b(proposals?|AIP|ARFC|temp(erature)? check|snapshot|votes?|voting|onchain|upgrades?|treasury|grants?|parameters?|RFC|request for comment)\b|^\[[^\]]+\]/i;

function loadSources(file = SOURCES_FILE) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(parsed) ? parsed : parsed.sources;
  return Array.isArray(list) ? list : [];
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function adapterName(entry) {
  if (entry.type === 'github') {
    const m = String(entry.url).match(/github\.com\/([^/]+)\/([^/]+)\/releases\.atom/i);
    return m ? 'gh:' + m[1] + '/' + m[2] : 'gh:' + hostOf(entry.url);
  }
  if (entry.type === 'forum') return 'forum:' + hostOf(entry.url);
  return 'blog:' + hostOf(entry.url);
}

function tagOf(link) {
  const m = String(link || '').match(/\/releases\/tag\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  const parts = String(link || '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function isUnstableRelease(tag, title) {
  return (tag && TAG_UNSTABLE_RE.test(tag)) || (title && TITLE_UNSTABLE_RE.test(title));
}

function releaseTitle(projectName, rawTitle) {
  const t = String(rawTitle || '').trim();
  if (!projectName) return t;
  const has = t.toLowerCase().indexOf(String(projectName).toLowerCase()) !== -1;
  return has ? t : (projectName + ' ' + t).trim();
}

function parseDate(it) {
  const d = new Date(it.isoDate || it.pubDate || '');
  return isNaN(d.getTime()) ? null : d;
}

function capAndSort(items) {
  items.sort((a, b) => b.publishedAt - a.publishedAt);
  items.length = Math.min(items.length, MAX_ITEMS);
  return items;
}

function makeGithubAdapter(entry) {
  const name = adapterName(entry);
  const domain = hostOf(entry.url);
  const parser = new Parser({ timeout: 15000 });
  async function run() {
    const res = await request(entry.url, { conditional: true });
    if (res.notModified || res.status === 304) return [];
    const parsed = await parser.parseString(res.text);
    const cutoff = Date.now() - SEVEN_D;
    const items = [];
    for (const it of parsed.items || []) {
      const rawTitle = String(it.title || '').trim();
      const url = String(it.link || '').trim();
      if (!rawTitle || !url) continue;
      const publishedAt = parseDate(it);
      if (!publishedAt || publishedAt.getTime() < cutoff) continue;
      const tag = tagOf(url);
      if (isUnstableRelease(tag, rawTitle)) continue;
      items.push({
        sourceName: name,
        sourceTier: 3,
        kind: 'official',
        exchange: null,
        title: releaseTitle(entry.name, rawTitle),
        url,
        publishedAt,
        hintCategory: null,
        hintTickers: [entry.base],
        sourceDomain: domain,
      });
    }
    return capAndSort(items);
  }
  return { name, tier: 3, intervalMs: INTERVAL_MS, quietHealth: entry.verified !== true, run };
}

function makeForumAdapter(entry) {
  const name = adapterName(entry);
  const domain = hostOf(entry.url);
  const parser = new Parser({ timeout: 15000 });
  async function run() {
    const res = await request(entry.url, { conditional: true });
    if (res.notModified || res.status === 304) return [];
    const parsed = await parser.parseString(res.text);
    const cutoff = Date.now() - SEVEN_D;
    const items = [];
    for (const it of parsed.items || []) {
      const title = String(it.title || '').trim();
      const url = String(it.link || '').trim();
      if (!title || !url) continue;
      if (!GOVERNANCE_RE.test(title)) continue;
      const publishedAt = parseDate(it);
      if (!publishedAt || publishedAt.getTime() < cutoff) continue;
      items.push({
        sourceName: name,
        sourceTier: 3,
        kind: 'official',
        exchange: null,
        title,
        url,
        publishedAt,
        hintCategory: null,
        hintTickers: [entry.base],
        sourceDomain: domain,
        alertable: false,
      });
    }
    return capAndSort(items);
  }
  return { name, tier: 3, intervalMs: INTERVAL_MS, quietHealth: entry.verified !== true, run };
}

function makeBlogAdapter(entry) {
  const name = adapterName(entry);
  const domain = hostOf(entry.url);
  const parser = new Parser({ timeout: 15000 });
  async function run() {
    const res = await request(entry.url, { conditional: true });
    if (res.notModified || res.status === 304) return [];
    const parsed = await parser.parseString(res.text);
    const cutoff = Date.now() - SEVEN_D;
    const items = [];
    for (const it of parsed.items || []) {
      const title = String(it.title || '').trim();
      const url = String(it.link || '').trim();
      if (!title || !url) continue;
      const publishedAt = parseDate(it);
      if (!publishedAt || publishedAt.getTime() < cutoff) continue;
      items.push({
        sourceName: name,
        sourceTier: 3,
        kind: 'official',
        exchange: null,
        title,
        url,
        publishedAt,
        hintCategory: null,
        hintTickers: [entry.base],
        sourceDomain: domain,
      });
    }
    return capAndSort(items);
  }
  return { name, tier: 3, intervalMs: INTERVAL_MS, quietHealth: entry.verified !== true, run };
}

function make({ sources = loadSources() } = {}) {
  const adapters = [];
  for (const entry of sources) {
    if (!entry || !entry.url || !entry.base) continue;
    if (entry.type === 'github') adapters.push(makeGithubAdapter(entry));
    else if (entry.type === 'forum') adapters.push(makeForumAdapter(entry));
    else adapters.push(makeBlogAdapter(entry));
  }
  return adapters;
}

module.exports = {
  make,
  loadSources,
  adapterName,
  tagOf,
  isUnstableRelease,
  releaseTitle,
  TAG_UNSTABLE_RE,
  TITLE_UNSTABLE_RE,
  GOVERNANCE_RE,
};
