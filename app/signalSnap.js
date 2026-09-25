'use strict';

require('dotenv').config();

const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

const { buildSnapshot } = require('./ingest/signalSnapshot');
const { BBW_LIVE_JSON, NEWS_LIVE_JSON } = require('./ingest/config');

const EVENTS_LIVE_JSON =
  process.env.EVENTS_LIVE_JSON ||
  'D:\\claude projects\\crypto\\screener\\events_live.json';

const fs = require('fs');
const TICK_MS = 15 * 1000;

const pending = new Map();

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function buildSeenAt(bbw) {
  const seenAt = new Map();
  const events = Array.isArray(bbw.events) ? bbw.events : [];
  for (const e of events) {
    if (e && e.ts_ms != null) {
      const k = [e.symbol, e.tf, e.bar1_t, e.direction, e.stage].join('|');
      const ts = Number(e.ts_ms);
      const prev = seenAt.get(k);
      if (prev == null || ts < prev) {
        seenAt.set(k, ts);
      }
    }
  }
  return seenAt;
}

function toDbData(data) {
  return {
    ...data,
    eventReasons: data.eventReasons == null ? Prisma.DbNull : data.eventReasons,
    scheduled: data.scheduled == null ? Prisma.DbNull : data.scheduled,
  };
}

async function storeOne(data, storedKeys) {
  try {
    await prisma.signalSnapshot.create({ data: toDbData(data) });
    storedKeys.add(data.key);
    pending.delete(data.key);
    console.log(
      `[signals] ${data.symbol} ${data.tf} ${data.stage} ${data.direction} coverage=${data.coverage} risk=${data.riskClass} events=${data.eventLevel} late=${data.late} lag=${data.lagMs}`
    );
  } catch (err) {
    if (err && err.code === 'P2002') {
      storedKeys.add(data.key);
      pending.delete(data.key);
      return;
    }
    pending.set(data.key, data);
    console.error(
      `[signals] failed to store ${data.key} (will retry same data): ${err && err.message ? err.message : err}`
    );
  }
}

async function loadExistingKeys() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.signalSnapshot.findMany({
    where: { firstSeenAt: { gte: since } },
    select: { key: true },
  });
  return new Set(rows.map((r) => r.key));
}

async function tick(storedKeys) {
  const bbw = readJson(BBW_LIVE_JSON);
  if (!bbw) return;

  const news = readJson(NEWS_LIVE_JSON);
  const events = readJson(EVENTS_LIVE_JSON);
  const now = new Date();

  const bbwAsof = bbw.asof || bbw.asof_iso || null;
  const bbwAsofMs = bbw.asof_ms != null ? bbw.asof_ms : null;
  const seenAt = buildSeenAt(bbw);
  const setups = Array.isArray(bbw.setups) ? bbw.setups : [];

  for (const data of [...pending.values()]) {
    if (storedKeys.has(data.key)) {
      pending.delete(data.key);
      continue;
    }
    await storeOne(data, storedKeys);
  }

  for (const setup of setups) {
    const k = [setup.symbol, setup.tf, setup.bar1_t, setup.direction, setup.stage].join('|');
    if (storedKeys.has(k) || pending.has(k)) continue;

    const data = buildSnapshot({
      setup,
      bbwAsof,
      bbwAsofMs,
      news,
      events,
      now,
      watcherSeenAt: seenAt.has(k) ? seenAt.get(k) : null,
    });
    if (!data) continue;
    if (storedKeys.has(data.key) || pending.has(data.key)) continue;

    await storeOne(data, storedKeys);
  }
}

async function main() {
  const storedKeys = await loadExistingKeys();
  console.log(
    `[signals] snapshotter started (${storedKeys.size} existing keys loaded)`
  );

  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick(storedKeys);
    } catch (err) {
      console.error(`[signals] tick error: ${err && err.stack ? err.stack : err}`);
    } finally {
      running = false;
    }
  }, TICK_MS);
}

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

main().catch((err) => {
  console.error(`[signals] fatal: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});