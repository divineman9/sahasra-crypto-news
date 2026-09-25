'use strict';

function toMs(v) {
  if (v instanceof Date) return v.getTime() > 0 ? v.getTime() : null;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return null;
}

const QUIET_FAIL_THRESHOLD = 6;
const QUIET_POLL_LOG_THROTTLE_MS = 3600000; // once/hour per adapter (F7)

function startHealth({ scheduler, alerts, intervalMs = 60000 }) {
  const startedAt = Date.now();
  // Unverified (quietHealth) sources: the actual once-per-6h retry backoff lives in
  // scheduler._backoffUntil (adapter.quietHealth), not here — see the Phase 3 step 6 fix-round
  // review (B1): a side-channel here that also pokes the scheduler's backoffUntil races the
  // scheduler's own per-run backoff computation and can undo the slow-down for hours. This file
  // only logs (never alerts Discord for a quietHealth source), throttled per adapter so a
  // permanently-dead source doesn't spam the log:
  //   - the generic "no successful poll" line: once per hour per adapter (F7)
  //   - the "[official] ... looks dead" line: once per failure streak (cleared on recovery)
  const quietDeadLogged = new Set(); // names that already printed the dead line for this streak
  const quietPollLoggedAt = new Map(); // name -> last time the "no successful poll" line printed
  const check = () => {
    try {
      let entries;
      try {
        entries = scheduler.health();
      } catch (e) {
        return;
      }
      for (const a of entries) {
        // Fix round (B1, step 7): the health window must never be tighter than 2x an adapter's own
        // poll interval — a fixed 30-min window falsely flags any 30-min-or-slower adapter (e.g.
        // youtube.js, official.js) as silent on the ~half of scheduler jitter cycles (0.8-1.2x
        // intervalMs) that land past 30 min, alerting every minute even though the adapter is
        // healthy. scheduler.health() already exposes intervalMs per adapter (see scheduler.js).
        const limit = Math.max(a.tier === 1 ? 15 * 60000 : 30 * 60000, (a.intervalMs || 0) * 2);
        const ref = toMs(a.lastOkAt) ?? startedAt;
        const age = Date.now() - ref;
        if (age > limit) {
          const mins = Math.floor(age / 60000);
          const text = `no successful poll for ${mins} min, last error: ${a.lastErr || 'none'}`;
          const lastLoggedAt = quietPollLoggedAt.get(a.name) || 0;
          if (!a.quietHealth || Date.now() - lastLoggedAt >= QUIET_POLL_LOG_THROTTLE_MS) {
            console.error(`[health] ${a.name} ${text}`);
            if (a.quietHealth) quietPollLoggedAt.set(a.name, Date.now());
          }
          if (alerts && !a.quietHealth) alerts.healthAlert(a.name, text);
        }
        if ((a.consecutiveSaveErrors || 0) >= 5) {
          const text = `saving items is failing (${a.consecutiveSaveErrors} runs in a row): ${a.lastSaveErr || ''}`;
          console.error(`[health] ${a.name} ${text}`);
          if (alerts && !a.quietHealth) alerts.healthAlert(a.name, text);
        }

        if (a.quietHealth) {
          const errs = a.consecutiveErrors || 0;
          if (errs >= QUIET_FAIL_THRESHOLD) {
            if (!quietDeadLogged.has(a.name)) {
              quietDeadLogged.add(a.name);
              // Fix round 2 (minor 2): a tg:* wire adapter's `verified` flag lives in
              // config.js's TG_CHANNELS, not officialSources.json — point at the right file.
              const remedy = a.name.startsWith('tg:')
                ? 'set verified:true in TG_CHANNELS (config.js) or remove it'
                : 'set verified:true or remove it from officialSources.json';
              console.log(`[official] ${a.name} looks dead (${a.lastErr || 'no successful poll'}); ${remedy}`);
            }
          } else if (errs === 0) {
            // recovered: clear so a future failure streak is handled (and logged) fresh
            quietDeadLogged.delete(a.name);
            quietPollLoggedAt.delete(a.name);
          }
        }
      }
    } catch (e) {
      console.error('[health] check error', e.message);
    }
  };
  const timer = setInterval(check, intervalMs);
  check();
  return () => clearInterval(timer);
}

module.exports = { startHealth };
