'use strict';

const SIGNAL_STAGES = new Set([
  'BAR1_CONFIRMED',
  'BAR2_CONFIRMED',
  'HOLDING',
  'FOUR_SOLID_BARS',
  'FOUR_BAR_PULLBACK_SETUP',
]);

function classifyItem(item) {
  const category = String(item.category || '').toLowerCase();
  const sentiment = String(item.sentiment || '').toLowerCase();
  if (category === 'hack' || category === 'delisting' || sentiment === 'bearish') return 'risk';
  if (sentiment === 'bullish') return 'catalyst';
  return 'other';
}

function baseFromSymbol(symbol) {
  let s = String(symbol || '');
  s = s.replace(/(USDT|USDC)$/i, '');
  s = s.replace(/^1000000/i, '');
  s = s.replace(/^1000/i, '');
  return s;
}

function clampInt(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(2147483647, Math.round(n)));
}

function isFresh(publishedAt, now) {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return false;
  const age = now - t; // positive = past
  return age <= 48 * 3600 * 1000 && age >= -5 * 60 * 1000;
}

function collectFreshItems(flagsEntry, now) {
  if (!flagsEntry || typeof flagsEntry !== 'object') return [];
  const seen = new Set();
  const out = [];
  const push = (item) => {
    if (!item || typeof item !== 'object') return;
    if (item.id == null || seen.has(item.id)) return;
    if (!isFresh(item.publishedAt, now)) return;
    seen.add(item.id);
    out.push({
      id: item.id,
      title: item.title != null ? item.title : null,
      category: item.category != null ? item.category : null,
      importance: item.importance != null ? item.importance : null,
      sentiment: item.sentiment != null ? item.sentiment : null,
      source: item.source != null ? item.source : null,
      publishedAt: item.publishedAt != null ? new Date(item.publishedAt).toISOString() : null,
      firstSeenAt: item.firstSeenAt != null ? new Date(item.firstSeenAt).toISOString() : null,
      class: classifyItem(item),
    });
  };
  if (Array.isArray(flagsEntry.items)) flagsEntry.items.forEach(push);
  for (const k of ['risk', 'catalyst', 'other']) {
    const v = flagsEntry[k];
    if (Array.isArray(v)) v.forEach(push);
    else if (v) push(v);
  }
  return out;
}

function matchScheduledEntry(entry, base, symbol) {
  if (!entry || typeof entry !== 'object') return false;
  const targets = [base, symbol, String(symbol || '').replace(/USDT$/i, '')]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  for (const field of ['symbol', 'coin', 'ticker', 'base']) {
    const v = entry[field];
    if (v == null) continue;
    const sv = String(v).replace(/USDT$/i, '').toLowerCase();
    if (targets.includes(String(v).toLowerCase()) || targets.includes(sv)) return true;
  }
  return false;
}

function supplyShockReasons(events, scheduled, base, symbol) {
  const out = [];
  if (!events || typeof events !== 'object') return out;
  const arr = (v) => (Array.isArray(v) ? v.filter((e) => matchScheduledEntry(e, base, symbol)) : []);
  const rows = (scheduled || []).slice();
  const shockRows = arr(events.supply_shock);
  const shock = rows.some((r) => r && r.supply_shock === true) || shockRows.length > 0;
  if (shock) {
    let maxPct = null;
    const srcs = new Set();
    for (const r of rows.concat(shockRows)) {
      if (!r) continue;
      for (const f of [r.max_pct, r.pct]) {
        const n = Number(f);
        if (f != null && Number.isFinite(n) && (maxPct === null || n > maxPct)) maxPct = n;
      }
      if (Array.isArray(r.sources)) r.sources.forEach((s) => srcs.add(String(s)));
    }
    const pctTxt = maxPct !== null ? ' ' + (Math.round(maxPct * 10) / 10) + '%' : '';
    const srcTxt = srcs.size > 0 ? ' (' + Array.from(srcs).join('+') + ')' : '';
    out.push('🔴 SUPPLY SHOCK' + pctTxt + srcTxt);
  }
  const dis = arr(events.unlock_disagreements);
  if (dis.length > 0) out.push('🟠 unlock sources disagree');
  return out;
}

function buildSnapshot({ setup, bbwAsof, bbwAsofMs, news, events, now, watcherSeenAt }) {
  if (!setup || typeof setup !== 'object') return null;
  const stage = setup.stage;
  if (!SIGNAL_STAGES.has(stage)) return null;
  if (setup.tf === '1m') return null;

  const nowMs = now != null ? new Date(now).getTime() : Date.now();
  const symbol = setup.symbol;
  const base = baseFromSymbol(symbol);

  // ----- coverage -----
  let coverage = 'unknown';
  let newsReadable = false;
  let freshItems = [];
  if (news && typeof news === 'object') {
    const asof = news.asof_ms;
    const stale = asof == null || nowMs - asof > 60000;
    const schemaOk = news.schema === 2;
    const healthOk = !(news.health && news.health.known && !news.health.ok);
    if (!stale && schemaOk && healthOk) {
      newsReadable = true;
      const flags = news.flags || {};
      const flagsEntry = flags[base] || flags[symbol];
      const fresh = collectFreshItems(flagsEntry, nowMs);
      coverage = fresh.length > 0 ? 'news' : 'none';
      freshItems = fresh;
    } else if (schemaOk || (news.flags && typeof news.flags === 'object')) {
      // readable enough to record what was visible, but coverage is unknown
      newsReadable = true;
      const flags = news.flags || {};
      const flagsEntry = flags[base] || flags[symbol];
      freshItems = collectFreshItems(flagsEntry, nowMs);
    } else {
      freshItems = [];
    }
  } else {
    freshItems = [];
  }

  const seenMs = watcherSeenAt != null && Number.isFinite(Number(watcherSeenAt)) ? Number(watcherSeenAt) : null;
  const lagMs = seenMs != null ? clampInt(nowMs - seenMs) : null;
  const late = seenMs == null || nowMs - seenMs > 300000;
  if (late) coverage = 'unknown';

  // Only news OBSERVED by the signal time (firstSeenAt <= watcherSeenAt) counts toward coverage/risk.
  const newsItems = freshItems.map((i) => {
    const t = i.firstSeenAt ? Date.parse(i.firstSeenAt) : NaN;
    return Object.assign({}, i, { atSignal: seenMs != null && Number.isFinite(t) && t <= seenMs });
  });
  const atSignal = newsItems.filter((i) => i.atSignal);
  const newsIds = atSignal.map((i) => i.id);
  if (coverage === 'news' && atSignal.length === 0) coverage = 'none';

  let riskClass = null;
  if (atSignal.length > 0) {
    if (atSignal.some((i) => i.class === 'risk')) riskClass = 'risk';
    else if (atSignal.some((i) => i.class === 'catalyst')) riskClass = 'catalyst';
    else riskClass = 'other';
  }

  // ----- events -----
  const ev = events && events.risk && events.risk[symbol];
  const side = setup.direction === 'DOWN' ? 'SHORT' : 'LONG';
  const eventLevel = ev && ev[side] ? ev[side].level : null;
  let eventReasons = ev && ev[side] ? (ev[side].reasons != null ? ev[side].reasons : null) : null;
  const eventBadges = (events && events.badges && events.badges[symbol]) || [];
  const eventsAgeMs = events && events.asof_ms ? clampInt(nowMs - events.asof_ms) : null;

  // ----- scheduled unlocks -----
  let scheduled = null;
  if (events && Array.isArray(events.unlocks_upcoming)) {
    const matches = events.unlocks_upcoming.filter((e) => matchScheduledEntry(e, base, symbol));
    if (matches.length > 0) scheduled = matches;
  }

  // Supply-shock / source-disagreement reasons (collector fields n_parts, sources, max_pct,
  // supply_shock, top-level supply_shock[] and unlock_disagreements[]). All optional: when the
  // collector does not emit them nothing is added.
  const extraReasons = supplyShockReasons(events, scheduled, base, symbol);
  if (extraReasons.length > 0) {
    eventReasons = (eventReasons == null ? [] : Array.isArray(eventReasons) ? eventReasons.slice() : [eventReasons]).concat(extraReasons);
  }

  const flagsEntryAll = news && news.flags ? (news.flags[base] || news.flags[symbol]) : null;
  const newsCount = flagsEntryAll && flagsEntryAll.count != null ? flagsEntryAll.count : null;
  const newsAgeMs = news && news.asof_ms != null ? clampInt(nowMs - news.asof_ms) : null;
  const newsHealthOk =
    news && news.health && news.health.known ? !!news.health.ok : null;

  return {
    key: [setup.symbol, setup.tf, setup.bar1_t, setup.direction, setup.stage].join('|'),
    symbol: setup.symbol,
    base,
    tf: setup.tf,
    direction: setup.direction,
    stage: setup.stage,
    bar1T: setup.bar1_t != null ? BigInt(setup.bar1_t) : null,
    highVol: setup.high_vol != null ? setup.high_vol : null,
    signalAsof: bbwAsofMs != null && Number.isFinite(Number(bbwAsofMs)) ? new Date(Number(bbwAsofMs)) : (bbwAsof ? new Date(bbwAsof) : null),
    watcherSeenAt: seenMs != null ? new Date(seenMs) : null,
    firstSeenAt: new Date(nowMs),
    lagMs,
    late,
    coverage,
    newsAgeMs,
    newsHealthOk,
    newsCount,
    newsIds,
    newsItems,
    riskClass,
    eventLevel,
    eventReasons,
    eventBadges: Array.isArray(eventBadges) ? eventBadges : [],
    scheduled,
    eventsAgeMs,
  };
}

module.exports = { buildSnapshot };