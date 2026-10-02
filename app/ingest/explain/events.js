'use strict';
// P5 §3.1 / §4.1 / §4.3: ExplainEvent store (one atomic JSON file), rate limits, queue, merge.
// No DB migration. Public/private: file lives under ingest/cache/explain/ (git-ignored).
const fs = require('fs');
const path = require('path');
const gate = require('./gate');
const { extractFacts, mergeFacts } = require('./facts');
const templates = require('./templates');
const evidence = require('./evidence');
const { etDay } = require('./timeET');
const { NEG_RE } = require('../classify');

const HOUR = 3600e3;
const MAX_PER_HOUR = 3;
const QUEUE_EXPIRE_MS = 6 * HOUR;
const CLOSE_AFTER_MS = 72 * HOUR;
const KEEP_MS = 30 * 24 * HOUR;
const MERGE_WINDOW_MS = 24 * HOUR;
const OFFICIAL_KINDS = new Set(['exchange', 'official', 'regulator', 'symbol']);

function writeAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  for (let i = 0; i < 5; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if ((e.code === 'EPERM' || e.code === 'EBUSY') && i < 4) { const until = Date.now() + 50; while (Date.now() < until) {} continue; }
      throw e;
    }
  }
}

function nameFor(ticker) {
  try { return require('../tickers').nameOf(ticker) || ticker; } catch (e) { return ticker; }
}

function sentimentOf(s) {
  return s === 'bullish' || s === 'bearish' ? s : 'neutral';
}

function createEngine(opts = {}) {
  const dir = opts.dir || process.env.EXPLAIN_DIR || path.join(__dirname, '..', 'cache', 'explain');
  const file = path.join(dir, 'events.json');
  const nowFn = opts.now || (() => Date.now());
  const calPath = opts.calendarPath !== undefined ? opts.calendarPath : (process.env.EXPLAIN_UNLOCK_CALENDAR || '');
  const maxPerHour = opts.maxPerHour || MAX_PER_HOUR;
  const log = opts.log || ((m) => console.log(m));
  let events = null;

  function load() {
    if (events) return events;
    try { events = JSON.parse(fs.readFileSync(file, 'utf8')); if (!Array.isArray(events)) events = []; } catch (e) { events = []; }
    return events;
  }
  function save() {
    fs.mkdirSync(dir, { recursive: true });
    writeAtomic(file, JSON.stringify(events));
  }
  const slotsUsed = (now) => load().filter((e) => e.live_at && Date.parse(e.live_at) > now - HOUR).length;

  function rebuild(ev, post, isFirst) {
    // Facts are recomputed from the event's merged facts; templates + evidence re-render each time.
    ev.text = templates.render(ev.category, ev.subtype, ev.facts);
    ev.glossary = ev.text.glossary || [];
    delete ev.text.glossary;
    ev.evidence = evidence.compute(ev.timeline, ev.facts);
  }

  function timelineEntry(post, kind, nowIso) {
    const info = evidence.sourceInfo(post);
    const pub = post.publishedAt instanceof Date ? post.publishedAt.getTime() : Date.parse(post.publishedAt);
    const ts = new Date(isFinite(pub) ? Math.min(pub, Date.parse(nowIso)) : Date.parse(nowIso)).toISOString();
    return Object.assign({ ts, kind, source: info.domain, title: post.title, url: post.url, post_id: post.id }, info);
  }

  function consider(post) {
    const now = nowFn();
    const nowIso = new Date(now).toISOString();
    const g = gate.evaluate(post, { now, calendarPath: calPath });
    if (!g.pass) return null;
    load();
    const day = etDay(now);
    const key = g.coin || g.topic;
    const id = `evt_${day}_${key}_${g.category}`;

    let ev = events.find((e) => e.id === id);
    if (!ev) {
      ev = events.find((e) => (e.post_ids.includes(post.id) || (post.storyId && e.story_ids.includes(post.storyId))) && now - Date.parse(e.created_at) < MERGE_WINDOW_MS) || null;
    }
    if (ev && ev.post_ids.includes(post.id)) return ev;

    const ticker = g.coin;
    const ctx = { category: g.category, subtype: g.subtype, ticker, name: ticker ? (post.names && post.names[ticker]) || nameFor(ticker) : (post.exchange || null), cal: g.calendar };
    const nf = extractFacts(post, ctx);

    if (ev) {
      // §4.3 attach
      const title = post.title || '';
      let kind = 'update';
      if (NEG_RE.test(title) && /hack|exploit/i.test(title)) kind = 'denial';
      else if (OFFICIAL_KINDS.has(post.kind)) kind = 'confirmation';
      ev.timeline.push(timelineEntry(post, kind, nowIso));
      ev.post_ids.push(post.id);
      if (post.storyId && !ev.story_ids.includes(post.storyId)) ev.story_ids.push(post.storyId);
      ev.facts = mergeFacts(ev.facts, nf);
      ev.importance = Math.max(ev.importance || 0, post.importance || 0);
      ev.rev += 1;
      ev.updated_at = nowIso;
      rebuild(ev, post, false);
      save();
      log(`[explain] merged ${ev.id} rev ${ev.rev}`);
      return ev;
    }

    const live = slotsUsed(now) < maxPerHour;
    const prior = events
      .filter((e) => e.category === g.category && (g.coin ? e.coin && e.coin.ticker === g.coin : e.topic === g.topic))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 5)
      .map((e) => ({ date: etDay(e.created_at), coin: e.coin ? e.coin.ticker : null, headline: e.facts.headline, r1: null, r7: null, r30: null }));
    ev = {
      id,
      rev: 1,
      created_at: nowIso,
      updated_at: nowIso,
      state: live ? 'live' : 'queued',
      category: g.category,
      subtype: g.subtype,
      sentiment: sentimentOf(post.sentiment),
      coin: ticker ? { ticker, name: ctx.name } : null,
      topic: g.coin ? null : g.topic,
      exchange: post.exchange ? String(post.exchange).toLowerCase() : null,
      facts: nf,
      text: null,
      evidence: null,
      heat: { level: null, range_24h_pct: null, private: null },
      history: { cases: prior, note: prior.length ? null : 'Not enough comparable cases' },
      timeline: [timelineEntry(post, 'first', nowIso)],
      post_ids: [post.id],
      story_ids: post.storyId ? [post.storyId] : [],
      glossary: [],
      importance: post.importance || 0,
      live_at: live ? nowIso : null,
    };
    rebuild(ev, post, true);
    events.push(ev);
    save();
    log(`[explain] new ${ev.state} event ${ev.id} (${g.reason})`);
    return ev;
  }

  // Promote queued events FIFO (importance desc, then time) while hourly slots are free.
  function promoteQueue() {
    load();
    const now = nowFn();
    let n = 0;
    for (;;) {
      if (slotsUsed(now) >= maxPerHour) break;
      const q = events.filter((e) => e.state === 'queued').sort((a, b) => (b.importance - a.importance) || (Date.parse(a.created_at) - Date.parse(b.created_at)));
      if (!q.length) break;
      q[0].state = 'live';
      q[0].live_at = new Date(now).toISOString();
      q[0].updated_at = q[0].live_at;
      n++;
      log(`[explain] promoted ${q[0].id}`);
    }
    if (n) save();
    return n;
  }

  function closeOld() {
    load();
    const now = nowFn();
    let closed = 0, expired = 0, pruned = 0;
    const keep = [];
    for (const e of events) {
      const age = now - Date.parse(e.created_at);
      if (e.state === 'queued' && age > QUEUE_EXPIRE_MS) { expired++; log(`[explain] queue expired ${e.id}`); continue; }
      if (age > KEEP_MS) { pruned++; continue; }
      if (e.state === 'live' && age > CLOSE_AFTER_MS) { e.state = 'closed'; closed++; }
      keep.push(e);
    }
    events = keep;
    if (closed || expired || pruned) save();
    return { closed, expired, pruned };
  }

  function tick() {
    return { promoted: promoteQueue(), ...closeOld() };
  }

  const visible = (e) => e.state !== 'queued';
  function list({ limit = 20, coin = null, includeQueued = false } = {}) {
    load();
    return events
      .filter((e) => (includeQueued || visible(e)) && (!coin || (e.coin && e.coin.ticker === String(coin).toUpperCase())))
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .slice(0, limit);
  }
  const get = (id) => load().find((e) => e.id === id) || null;
  const byPost = (postId) => load().find((e) => visible(e) && e.post_ids.includes(postId)) || null;
  function reset() { events = null; }

  return { consider, promoteQueue, closeOld, tick, list, get, byPost, reset, file, _events: () => load() };
}

let def = null;
function engine() {
  if (!def) def = createEngine();
  return def;
}
// Safe wrappers for the live collector: never throw into the ingest path.
function consider(post) {
  if (process.env.EXPLAIN_ENABLED === '0') return null;
  try { return engine().consider(post); } catch (e) { console.error('[explain] consider error:', e.message || e); return null; }
}
function tick() {
  if (process.env.EXPLAIN_ENABLED === '0') return null;
  try { return engine().tick(); } catch (e) { console.error('[explain] tick error:', e.message || e); return null; }
}

module.exports = { createEngine, consider, tick, engine };
