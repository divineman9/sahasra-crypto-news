#!/usr/bin/env node
'use strict';

// Optional, human-run CLI (Phase 3 step 6): crawls CoinGecko's /coins/<id> "links" block for the
// coin bases we already track and proposes new official source entries (github releases.atom /
// forum latest.rss / blog rss) into app/ingest/officialSources.proposed.json for a human to
// review and copy into officialSources.json by hand. It NEVER writes officialSources.json itself.
//
// Cannot be run inside this build container (internet is blocked here) — see build/tests/
// p3_step6_sources.test.js for the fixture-driven unit test of `mapCoinGeckoLinks`, the one pure
// function in this file. Only mapCoinGeckoLinks is exported/tested; the rest (fetch, rate limit,
// CLI plumbing) is exercised by hand on first real run.
//
// Usage: COINGECKO_DEMO_KEY=xxxxx node build/tools/coingecko_links.js [extra_bases_file]
//   - coin bases come from app/ingest/coinSources.json's keys (skipping any starting with "_")
//     plus, one per line, any bases (or "TICKER:coingecko-id" pairs — CoinGecko ids frequently
//     differ from the ticker, e.g. OP -> "optimism", not "op") listed in extra_bases_file.
//   - a bare ticker with no ":id" is guessed as its lowercased ticker; that guess is often wrong
//     (this is a known, documented gap — every proposal needs a human to check the id resolved
//     to the right project before it's fetched, let alone before anything is copied over).

const fs = require('fs');
const path = require('path');

const COIN_SOURCES_FILE = path.join(__dirname, '..', '..', 'app', 'ingest', 'coinSources.json');
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'app', 'ingest', 'officialSources.proposed.json');
const RATE_LIMIT_PER_MIN = 25;
const MIN_GAP_MS = Math.ceil(60000 / RATE_LIMIT_PER_MIN);

// ---- pure mapping function (unit-tested) ---------------------------------------------------
// CoinGecko /coins/{id} JSON -> proposed officialSources.json-shaped entries for `base`.
// Never throws on missing/malformed `links`; just returns fewer (or zero) proposals.
function mapCoinGeckoLinks(base, coinJson) {
  const name = (coinJson && coinJson.name) || base;
  const links = (coinJson && coinJson.links) || {};
  const out = [];
  const seenUrls = new Set();
  const push = (entry) => {
    if (!entry.url || seenUrls.has(entry.url)) return;
    seenUrls.add(entry.url);
    out.push(entry);
  };

  const githubRepos = (links.repos_url && Array.isArray(links.repos_url.github)) ? links.repos_url.github : [];
  for (const repoUrl of githubRepos) {
    const m = String(repoUrl || '').match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/i);
    if (!m) continue;
    push({
      base,
      type: 'github',
      url: `https://github.com/${m[1]}/${m[2]}/releases.atom`,
      name,
      verified: false,
    });
  }

  const homepages = Array.isArray(links.homepage) ? links.homepage : [];
  const homepage = homepages.find((u) => u && /^https?:\/\//i.test(u));
  if (homepage) push({ base, type: 'blog', url: homepage, name, verified: false });

  const announcements = Array.isArray(links.announcement_url) ? links.announcement_url : [];
  const announcement = announcements.find((u) => u && /^https?:\/\//i.test(u));
  if (announcement) push({ base, type: 'blog', url: announcement, name, verified: false });

  const forums = Array.isArray(links.official_forum_url) ? links.official_forum_url : [];
  const forum = forums.find((u) => u && /^https?:\/\//i.test(u));
  if (forum) {
    const url = /\.rss$/i.test(forum) ? forum : forum.replace(/\/?$/, '') + '/latest.rss';
    push({ base, type: 'forum', url, name, verified: false });
  }

  return out;
}

// ---- CLI (not exercised in tests) ----------------------------------------------------------
function loadBases(extraFile) {
  const bases = new Map(); // base -> coingecko id (or null -> guess from lowercased base)
  try {
    const coinSources = JSON.parse(fs.readFileSync(COIN_SOURCES_FILE, 'utf8'));
    for (const key of Object.keys(coinSources)) {
      if (key.startsWith('_')) continue;
      bases.set(key.toUpperCase(), null);
    }
  } catch (e) {
    console.error('[coingecko_links] could not read', COIN_SOURCES_FILE, e.message);
  }
  if (extraFile) {
    const lines = fs.readFileSync(extraFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const [base, id] = line.split(':');
      if (base) bases.set(base.trim().toUpperCase(), (id || '').trim() || null);
    }
  }
  return bases;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiKey = process.env.COINGECKO_DEMO_KEY;
  if (!apiKey) {
    console.error('[coingecko_links] COINGECKO_DEMO_KEY is not set. Get a free CoinGecko Demo API key ' +
      'and re-run: COINGECKO_DEMO_KEY=xxxxx node build/tools/coingecko_links.js [extra_bases_file]');
    process.exit(1);
  }

  const extraFile = process.argv[2] || null;
  const bases = loadBases(extraFile);
  if (bases.size === 0) {
    console.error('[coingecko_links] no coin bases found (coinSources.json empty and no list file given)');
    process.exit(1);
  }

  const proposals = [];
  let lastReqAt = 0;
  for (const [base, idGuess] of bases) {
    const id = idGuess || base.toLowerCase();
    const wait = MIN_GAP_MS - (Date.now() - lastReqAt);
    if (wait > 0) await sleep(wait);
    lastReqAt = Date.now();
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}` +
        '?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false';
      const res = await fetch(url, { headers: { 'x-cg-demo-api-key': apiKey } });
      if (!res.ok) {
        console.error(`[coingecko_links] ${base} (${id}): HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const mapped = mapCoinGeckoLinks(base, json);
      proposals.push(...mapped);
      console.log(`[coingecko_links] ${base} (${id}): ${mapped.length} candidate(s)`);
    } catch (e) {
      console.error(`[coingecko_links] ${base} (${id}): ${e.message || e}`);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    _meta: {
      generatedAt: new Date().toISOString(),
      purpose: 'Proposed additions for app/ingest/officialSources.json — human review only, never auto-applied.',
    },
    proposed: proposals,
  }, null, 2));
  console.log(`[coingecko_links] wrote ${proposals.length} proposal(s) to ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[coingecko_links] fatal:', e && e.stack ? e.stack : e);
    process.exit(1);
  });
}

module.exports = { mapCoinGeckoLinks };
