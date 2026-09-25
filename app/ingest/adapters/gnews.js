'use strict';

const fs = require('fs');
const path = require('path');
const http = require('../http');
const { matchCoin, stripSourceSuffix, getRec } = require('../coinMatch');
const { isNonCoin } = require('../tickers');

const JUNK_HOSTS = ['binance.com', 'kucoin.com', 'bybit.com', 'bitget.com', 't.co'];
const DEFAULT_STATE_FILE = path.join(__dirname, '..', 'cache', 'gnews_state.json');
const MAX_PER_TICK = 3;
const MAX_ITEMS_PER_COIN = 30;
const SEVEN_D = 7 * 86400000;

function tierAIntervalMin(n, budget, minMin) {
  return Math.max(minMin, Math.ceil((1440 * n) / (0.9 * budget)));
}

function decode(s) {
  if (!s) return '';
  let out = String(s).trim();
  if (out.startsWith('<![CDATA[') && out.endsWith(']]>')) {
    out = out.slice(9, -3).trim();
  }
  out = out
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  return out.trim();
}

function parseItems(xml) {
  const text = String(xml || '');
  const chunks = text.split(/<item>/i);
  const items = [];
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const end = chunk.indexOf('</item>');
    const body = end >= 0 ? chunk.slice(0, end) : chunk;
    const titleMatch = body.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = body.match(/<link>([\s\S]*?)<\/link>/i);
    const pubMatch = body.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const srcMatch = body.match(/<source url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
    items.push({
      title: decode(titleMatch ? titleMatch[1] : ''),
      link: decode(linkMatch ? linkMatch[1] : ''),
      pubDate: decode(pubMatch ? pubMatch[1] : ''),
      sourceUrl: decode(srcMatch ? srcMatch[1] : ''),
      publisherName: decode(srcMatch ? srcMatch[2] : '')
    });
  }
  return items;
}

function loadState(stateFile) {
  try {
    const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (!st || typeof st !== 'object') throw new Error('bad state');
    if (!st.coins || typeof st.coins !== 'object') st.coins = {};
    return st;
  } catch (e) {
    return { day: '', used: 0, coins: {} };
  }
}

function saveState(stateFile, st) {
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile + '.tmp', JSON.stringify(st));
    fs.renameSync(stateFile + '.tmp', stateFile);
  } catch (e) {
    console.error('[gnews] failed to save state:', e && e.message);
  }
}

function make({
  getTierA,
  request = http.request,
  now = () => Date.now(),
  stateFile = process.env.GNEWS_STATE_FILE || DEFAULT_STATE_FILE,
  budget = Number(process.env.GNEWS_DAILY_BUDGET || 5000),
  tierAMin = Number(process.env.GNEWS_TIER_A_MIN || 20),
  enabled = process.env.GNEWS_ENABLED !== '0'
} = {}) {
  let tierList = [];
  let tierAt = 0;
  let consecutive429 = 0;
  let lastStatsAt = now();
  let stats = { kept: 0, dropped: 0, junk: 0, errors: 0 };
  let lastInterval = null;

  async function run() {
    if (!enabled) return [];

    const t = now();
    if (t - tierAt >= 60000 || !tierList.length) {
      try {
        tierList = (getTierA() || [])
          .map(x => String(x).toUpperCase())
          .filter(b => /^[A-Z0-9]+$/.test(b) && !isNonCoin(b));
      } catch (e) {
        /* keep previous */
      }
      tierAt = t;
    }

    const st = loadState(stateFile);
    const day = new Date(t).toISOString().slice(0, 10);
    if (st.day !== day) {
      st.day = day;
      st.used = 0;
    }
    for (const base of tierList) {
      st.coins[base] = st.coins[base] || { nextDueAt: 0, lastOkAt: 0, firstDone: false };
      if (st.coins[base].lastOkAt && t - st.coins[base].lastOkAt > SEVEN_D) st.coins[base].firstDone = false;
    }

    const intervalMin = tierAIntervalMin(tierList.length, budget, tierAMin);
    if (lastInterval !== null && intervalMin !== lastInterval) {
      console.log(`[gnews] tier-A interval now ${intervalMin}m for ${tierList.length} coins`);
    }
    lastInterval = intervalMin;

    if (t - lastStatsAt >= 600000) {
      const dueCount = tierList.filter(b => st.coins[b].nextDueAt <= t).length;
      console.log(`[gnews] used=${st.used}/${budget} today, coins=${tierList.length}, interval=${intervalMin}m, due=${dueCount}, kept=${stats.kept} dropped=${stats.dropped} junk=${stats.junk} (last 10 min), errors=${stats.errors}`);
      stats = { kept: 0, dropped: 0, junk: 0, errors: 0 };
      lastStatsAt = t;
    }

    if (st.used >= budget) {
      saveState(stateFile, st);
      return [];
    }

    const due = tierList
      .filter(b => st.coins[b].nextDueAt <= t)
      .sort((a, b) => st.coins[a].nextDueAt - st.coins[b].nextDueAt)
      .slice(0, Math.min(MAX_PER_TICK, budget - st.used));
    if (!due.length) {
      saveState(stateFile, st);
      return [];
    }

    const pending = [];
    try {
      for (const base of due) {
        const rec = getRec(base);
        const q = rec.query + ' when:' + (st.coins[base].firstDone ? '2d' : '7d');
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
        st.used += 1;
        const res = await request(url, { timeoutMs: 12000 });
        const text = String(res && res.text || '');
        if (!/<rss|<item>/i.test(text)) throw Object.assign(new Error('gnews: non-RSS body'), { status: 429, retryAfterMs: 0 });
        const items = [];
        for (const it of parseItems(text)) {
          let host = 'news.google.com';
          try {
            host = new URL(it.sourceUrl).hostname.replace(/^www\./, '');
          } catch (e) {
            /* keep default */
          }
          if (JUNK_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
            stats.junk += 1;
            continue;
          }
          const title = stripSourceSuffix(it.title, it.publisherName);
          const pub = new Date(it.pubDate);
          if (isNaN(pub.getTime()) || t - pub.getTime() > SEVEN_D || pub.getTime() - t > 10 * 60000) {
            stats.dropped += 1;
            continue;
          }
          if (!matchCoin(title, base, rec)) {
            stats.dropped += 1;
            continue;
          }
          items.push({
            sourceName: 'gnews:' + host,
            sourceTier: 4,
            kind: 'news',
            exchange: null,
            title,
            url: it.link,
            publishedAt: pub,
            hintCategory: null,
            hintTickers: [base],
            sourceDomain: host,
            alertable: false
          });
        }
        items.sort((a, b) => b.publishedAt - a.publishedAt);
        pending.push({ base, items: items.slice(0, MAX_ITEMS_PER_COIN) });
      }
    } catch (err) {
      stats.errors += 1;
      if (err && err.status === 429) {
        consecutive429 += 1;
        err.retryAfterMs = Math.max(err.retryAfterMs || 0, 60000 * Math.pow(2, Math.min(consecutive429 - 1, 5)));
      }
      saveState(stateFile, st); // persist `used`; do NOT advance any nextDueAt
      throw err; // rethrow the SAME error object so the scheduler backs off
    }
    consecutive429 = 0;

    for (const p of pending) {
      st.coins[p.base].nextDueAt = t + intervalMin * 60000;
      st.coins[p.base].firstDone = true;
      st.coins[p.base].lastOkAt = t;
    }
    saveState(stateFile, st);
    const out = pending.flatMap(p => p.items);
    stats.kept += out.length;
    return out;
  }

  return { name: 'gnews', tier: 4, intervalMs: 20000, warmRuns: 1, run };
}

module.exports = { make, tierAIntervalMin, parseItems };