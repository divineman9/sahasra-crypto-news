'use strict';

const { nameOf, isNonCoin, STOCK_PERP_TITLE_RE } = require('./tickers');
const SOURCES = require('./coinSources.json'); // keys starting with '_' are metadata and must be ignored

const CONTEXT_RE = /\b(crypto|cryptocurrenc(y|ies)|tokens?|coins?|altcoins?|memecoin|meme coin|blockchain|on-?chain|DeFi|DEX|perps?|perpetual|futures|staking|stake|unlock|airdrop|mainnet|testnet|launch(es|ed)?|upgrade|partnership|integration|listing|TVL|whales?|liquidations?|market cap|price|rall(y|ies)|surges?|jumps?|drops?|falls?|rebounds?|breakout|bullish|bearish|bull|bear|ETPs?|ETFs?|wallet|validators?|protocol|network|USDT|Binance|Coinbase|Bybit|Bitget|Kraken|OKX)\b/i;
const STOCK_WORDS_RE = /\b(shares|stock price|\(NYSE:|\(NASDAQ:|earnings|EPS)\b/i;
const JUNK_TITLE_RE = /^Convert \d|\(@[A-Za-z0-9_.-]+\)'s insights|Price Today, Live Chart|Related Funding Rounds|Price, Market Cap, Volume and Chart|^\$?[A-Za-z]+ Entry: \d/i;

function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function getRec(base) {
  const b = String(base).toUpperCase();
  if (SOURCES[b] && !b.startsWith('_')) return SOURCES[b];
  return {
    name: nameOf(b),
    aliases: [nameOf(b)],
    ambiguous: true,
    query: '"' + nameOf(b) + '" crypto'
  };
}

function listBases() {
  return Object.keys(SOURCES).filter(k => !k.startsWith('_'));
}

function stripSourceSuffix(title, publisher) {
  const t = String(title || '').trim();
  if (typeof publisher === 'string' && publisher) {
    const suffix = ' - ' + publisher;
    if (t.endsWith(suffix)) return t.slice(0, t.length - suffix.length).trim();
  }
  return t.replace(/\s+-\s+[^-]{1,60}$/, '').trim();
}

function matchCoin(title, base, rec) {
  const r = rec || getRec(base);
  const B = String(base).toUpperCase();
  const t = String(title || '').trim();

  // 1. hard rejects
  if (isNonCoin(B) || STOCK_PERP_TITLE_RE.test(t) || JUNK_TITLE_RE.test(t)) return false;

  // 2. aliases (case-insensitive, word-bounded)
  const aliases = r.aliases || [];
  for (const alias of aliases) {
    const re = new RegExp('(^|[^a-z0-9])' + esc(alias.toLowerCase()) + '([^a-z0-9]|$)');
    if (re.test(t.toLowerCase())) return true;
  }

  // 3. $TICKER
  if (new RegExp('\\$' + esc(B) + '\\b', 'i').test(t)) return true;

  // 4. TICKERUSDT
  if (new RegExp('\\b' + esc(B) + 'USDT\\b').test(t)) return true;

  // 5. (TICKER) unless stock wording
  const stock = STOCK_WORDS_RE.test(t);
  if (!stock && t.includes('(' + B + ')')) return true;

  // 6. weak matches with crypto context (CASE-SENSITIVE)
  const weak = Array.isArray(r.weak) ? r.weak : (r.ambiguous ? [] : [B, r.name]);
  if (!stock && CONTEXT_RE.test(t)) {
    for (const w of weak) {
      if (!w) continue;
      const re = new RegExp('(^|[^A-Za-z0-9])' + esc(w) + '([^A-Za-z0-9]|$)');
      if (re.test(t)) return true;
    }
  }

  // 7. no match
  return false;
}

module.exports = { matchCoin, stripSourceSuffix, getRec, listBases, CONTEXT_RE, JUNK_TITLE_RE };