'use strict';
// P5 P2: heat badge data. Public: 24h range % from the Binance perp 24h ticker. Private (EXPLAIN_PRIVATE=1):
// funding rate + 24h open-interest change. At most one lookup per coin per 10 minutes (callers cache via checked_at).

const HIGH_RANGE = 8; // percent
const HIGH_FUNDING = 0.05; // percent per funding interval
const HIGH_OI = 25; // percent change over 24h

const r1 = (n) => Math.round(Number(n) * 10) / 10;

async function lookup(ticker, request, priv) {
  const sym = String(ticker).toUpperCase() + 'USDT';
  const out = { range_24h_pct: null, funding: null, oi_chg_24h: null };
  try {
    const j = (await request(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`)).json();
    const hi = Number(j.highPrice), lo = Number(j.lowPrice);
    if (hi > 0 && lo > 0) out.range_24h_pct = r1(((hi - lo) / lo) * 100);
  } catch (e) { /* no perp or network: leave null */ }
  if (priv) {
    try {
      const j = (await request(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`)).json();
      if (j && j.lastFundingRate != null) out.funding = Math.round(Number(j.lastFundingRate) * 100 * 1000) / 1000;
    } catch (e) { /* ignore */ }
    try {
      const j = (await request(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=25`)).json();
      if (Array.isArray(j) && j.length >= 2) {
        const a = Number(j[0].sumOpenInterest), b = Number(j[j.length - 1].sumOpenInterest);
        if (a > 0) out.oi_chg_24h = r1(((b - a) / a) * 100);
      }
    } catch (e) { /* ignore */ }
  }
  return out;
}

// Pure: {range_24h_pct, funding, oi_chg_24h} -> heat object stored on the event.
function toHeat(m, priv, nowIso) {
  const range = m.range_24h_pct;
  let high = range != null && range >= HIGH_RANGE;
  let priv_ = null;
  if (priv) {
    priv_ = { funding_1h: m.funding, oi_chg_24h: m.oi_chg_24h };
    if (m.funding != null && Math.abs(m.funding) >= HIGH_FUNDING) high = true;
    if (m.oi_chg_24h != null && m.oi_chg_24h >= HIGH_OI) high = true;
    if (m.funding == null && m.oi_chg_24h == null) priv_ = null;
  }
  return { level: range == null && !high ? null : high ? 'high' : 'normal', range_24h_pct: range, private: priv_, checked_at: nowIso };
}

function makeFetcher(request, priv) {
  return async (ticker) => lookup(ticker, request, priv);
}

module.exports = { lookup, toHeat, makeFetcher, HIGH_RANGE, HIGH_FUNDING, HIGH_OI };
