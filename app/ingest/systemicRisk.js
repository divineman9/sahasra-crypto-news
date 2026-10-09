'use strict';

const registry = require('./keyFigures.json');

const ATTRIBUTION_RE = /\b(says?|said|warns?|warned|warning|urges?|urged|claims?|believes?|thinks?|told|tells|cautions?|admits?|reveals?|predicts?|argues?|according to|weighs in|weighs-in)\b/i;
const TOPIC_RE = /\b(cryptograph\w*|quantum|post-quantum|lattice|private keys?|signatures?|encryption|ai risks?|wallet (moves?|migrations?)|vulnerab\w*|exploit\w*|hack\w*|breach\w*|insolven\w*|bankrupt\w*|halt(s|ed)? withdrawals|withdrawals? (halt|paused|suspended|frozen)|bans?|banned|shut ?down|51% attack|consensus (bug|failure)|ai (could|can|may|will|might) (break|crack|undermine|weaken|threaten|damage))\b/i;
const RISK_RE = /\b(threat\w*|risks?|break\w*|crack\w*|undermin\w*|weaken\w*|vulnerab\w*|attack\w*|danger\w*|exploit\w*|hack\w*|breach\w*|stolen|drain\w*|insolven\w*|bankrupt\w*|collaps\w*|halt\w*|frozen|freez\w*|suspend\w*|compromis\w*|warn\w*|fears?)\b/i;
const TARGET_RE = /\b(crypto|cryptocurrenc\w*|bitcoin|btc|ethereum|eth|blockchain|wallets?|network|exchange|stablecoins?|defi|solana|xrp|cardano|binance|coinbase|tether|usdc)\b/i;
const EXCLUDE_RE = /\b(denies|denied|debunk\w*|rejects? (claims|reports)|no (risk|threat)|not (a|at) risk|fake|rumou?rs?|parody|podcast|interview recap|price predictions?|throwback|years ago|anniversary)\b/i;
const NEGATION_EXCLUDE_RES = [
  /\b(not|no|never|won'?t|will not|isn'?t|aren'?t|doesn'?t|decades away|survive\w*|safe|safest|most secure)\b/i,
  /\bhow\b.*\bworks?\b/i,
  /\b(fund|grant|bounty|program)\b/i,
  /\b(backs|supports|proposes|welcomes)\b/i
];
const EXCEPTION_RE = /\b(don'?t rush|not to rush|no exploit)\b/i;
const POSITIVE_RE = /\b(enhanced|enhances|improves?|improved|boosts?|strengthens?|transform\w*)\b[^.]{0,40}\b(security|privacy)\b|\b(security|privacy)\b[^.]{0,20}\b(enhanced|improved|boost\w*)\b/i;
const FAILURE_RE = /\b(halt(ed|s)? withdrawals|withdrawals? (halt|paused|suspended|frozen)|insolven\w*|bankrupt\w*|collapse\w*|chain (halt|halted|stopped))\b/i;
const CONFIRMED_RE = /\b(exploited|drained|stolen|hacked|breach(ed)? confirmed|vulnerability (found|confirmed|exploited)|funds lost)\b/i;
const NEGATION_BEFORE_RE = /\b(not|no|never|isn'?t|denies|deny)\b[^]{0,25}$/i;
const INHERENTLY_SYSTEMIC_RE = /\b(cryptograph\w*|encryption|quantum|post-quantum|lattice|private keys?|signatures?)\b/i;

const SYSTEMIC_TOPICS = new Set([
  'cryptography',
  'encryption',
  'quantum',
  'post-quantum',
  'lattice',
  'private key',
  'private keys',
  'signature',
  'signatures'
]);

const POLICY_FIGURES = new Set(['sec', 'fed', 'bessent']);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTopic(kw) {
  const t = kw.toLowerCase();
  if (t === 'cryptographic' || t === 'cryptography') return 'cryptography';
  return t;
}

function findTopic(title) {
  const re = new RegExp(TOPIC_RE.source, 'gi');
  let m;
  while ((m = re.exec(title)) !== null) {
    return normalizeTopic(m[0]);
  }
  return null;
}

function findSystemicTopic(title) {
  const re = new RegExp(INHERENTLY_SYSTEMIC_RE.source, 'gi');
  let m;
  while ((m = re.exec(title)) !== null) {
    return normalizeTopic(m[0]);
  }
  return null;
}

function matchFigure(title) {
  if (!title || typeof title !== 'string') return null;
  const lower = title.toLowerCase();
  for (const entry of registry) {
    const aliases = entry.aliases || (entry.name ? [entry.name] : []);
    for (const alias of aliases) {
      if (!alias) continue;
      const re = new RegExp('\\b' + escapeRegExp(alias.toLowerCase()) + '\\b', 'i');
      if (re.test(lower)) {
        return { entry, alias, index: lower.search(re) };
      }
    }
  }
  return null;
}

function hasAttribution(title, match) {
  if (ATTRIBUTION_RE.test(title)) return true;
  const after = new RegExp(escapeRegExp(match.alias) + "\\s*:", 'i');
  if (after.test(title)) return true;
  const possessive = new RegExp(escapeRegExp(match.alias) + "'s\\s+\\w+", 'i');
  if (possessive.test(title)) return true;
  return false;
}

function negatedBefore(title, index) {
  const before = title.slice(Math.max(0, index - 30), index);
  return NEGATION_BEFORE_RE.test(before);
}

function computeSubtypeSeverity(title) {
  let m;
  const failRe = new RegExp(FAILURE_RE.source, 'gi');
  while ((m = failRe.exec(title)) !== null) {
    if (!negatedBefore(title, m.index)) return { subtype: 'failure', severity: 5 };
  }
  const confRe = new RegExp(CONFIRMED_RE.source, 'gi');
  while ((m = confRe.exec(title)) !== null) {
    if (!negatedBefore(title, m.index)) return { subtype: 'confirmed', severity: 4 };
  }
  return { subtype: 'warning', severity: 3 };
}

function computeImportance(sourceTier, kind) {
  const t = Number(sourceTier) || 4;
  if (t <= 2 || ['official', 'regulator', 'exchange'].includes(kind)) return 75;
  if (t === 3) return 65;
  return 50;
}

function detect({ title, sourceTier = 99, kind = null } = {}) {
  if (!title) return null;
  if (EXCLUDE_RE.test(title)) return null;
  if (POSITIVE_RE.test(title)) return null;

  const match = matchFigure(title);
  if (!match) return null;

  if (!hasAttribution(title, match)) return null;

  const systemic = findSystemicTopic(title);
  if (!systemic && !TARGET_RE.test(title)) {
    const topic = findTopic(title);
    if (!topic) return null;
    if (!SYSTEMIC_TOPICS.has(topic) && !TARGET_RE.test(title)) return null;
  }

  const topic = systemic || findTopic(title);
  if (!topic) return null;

  if (!RISK_RE.test(title)) return null;

  if (EXCEPTION_RE.test(title) && RISK_RE.test(title)) {
    // keep the item
  } else {
    for (const re of NEGATION_EXCLUDE_RES) {
      if (re.test(title)) return null;
    }
  }

  const { entry } = match;
  const { subtype, severity } = computeSubtypeSeverity(title);

  if (POLICY_FIGURES.has(entry.id)) {
    const cryptoTopic = systemic !== null;
    if (!cryptoTopic && subtype !== 'confirmed' && subtype !== 'failure') return null;
  }

  const importance = computeImportance(sourceTier, kind);

  return {
    figureId: entry.id,
    figureName: entry.name,
    coins: entry.coins || [],
    topic,
    subtype,
    severity,
    importance
  };
}

module.exports = { detect, matchFigure: (title) => { const m = matchFigure(title); return m ? m.entry : null; } };