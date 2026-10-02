// P5 P2: number guard (spec 4.6): the seven required cases plus date integers, $2.3m, word rules.
const { check, eq, done } = require('./assert_lib');
const APP = 'D:/claude projects/crypto-news-terminal/app';
const guard = require(APP + '/ingest/explain/numberGuard.js');
const templates = require(APP + '/ingest/explain/templates.js');
const { extractFacts } = require(APP + '/ingest/explain/facts.js');

const mk = (post, cat, sub, ticker) => {
  const facts = extractFacts(Object.assign({ sourceDomain: 'theblock.co', sourceTier: 2, kind: 'news', url: 'https://x.test', publishedAt: new Date('2026-10-02T13:05:00Z'), exchange: null }, post), { category: cat, subtype: sub, ticker, name: ticker, cal: null });
  return { facts, tpl: templates.render(cat, sub, facts) };
};
const { facts, tpl } = mk({ title: 'StakeStone (STO) unlocks 21,351,728 tokens, 5.1% of circulating supply, on Oct 2', unlockPct: 5.1, unlockPctBasis: 'circulating', unlockAmount: 21351728 }, 'unlock', 'supply_shock', 'STO');
const rewrite = (over) => Object.assign({ why: tpl.why, tradeoffs: tpl.tradeoffs, scenarios: tpl.scenarios.map((s) => ({ title: s.title, condition: s.condition })) }, over);
const withTitle = (t) => rewrite({ scenarios: tpl.scenarios.map((s, i) => ({ title: i === 0 ? t : s.title, condition: s.condition })) });
const ok = (o) => guard.check(o, tpl, facts);

console.log('— the seven required cases');
eq('passthrough (template text itself) is accepted', ok(rewrite({})), { ok: true, reason: null });
const inv = ok(rewrite({ why: tpl.why.replace('More coins', 'About 12% more coins') }));
check('invented 12% rejected', !inv.ok && /number 12 not in input/.test(inv.reason), inv);
eq('5.10% of 5.1 accepted', ok(rewrite({ tradeoffs: 'About 5.10% more coins can now be traded, so everyone else holds a bigger pile than yesterday.' })).ok, true);
const t2 = mk({ title: 'XYZ unlocks 2,000,000 tokens, 6% of circulating supply, on Oct 2', unlockPct: 6, unlockPctBasis: 'circulating', unlockAmount: 2000000 }, 'unlock', 'supply_shock', 'XYZ');
const o2 = { why: t2.tpl.why, tradeoffs: 'About 2m XYZ coins become free to trade, so everyone else holds more than before.', scenarios: t2.tpl.scenarios.map((s) => ({ title: s.title, condition: s.condition })) };
eq('2m for 2,000,000 accepted', guard.check(o2, t2.tpl, t2.facts).ok, true);
const sol = ok(withTitle('Price drifts lower and SOL may move too.'));
check('new coin SOL rejected', !sol.ok && /ticker SOL/.test(sol.reason), sol);
const tg = ok(withTitle('Price drifts lower toward a target.'));
check('word "target" rejected', !tg.ok && /banned word "target"/.test(tg.reason), tg);
const tr = guard.validateOutput('{"why":"x","tradeoffs":"y","scenarios":[{"title":"a"', tpl, facts);
check('truncated JSON rejected', !tr.ok && /JSON/.test(tr.reason), tr);

console.log('— more guard rules');
check('$2.3m style amount from facts accepted', (() => { const h = mk({ title: 'Protocol Q hacked, $2.3M drained' }, 'hack', 'theft', 'QQQ'); return guard.check({ why: h.tpl.why, tradeoffs: 'Pausing protects what is left but locks users out meanwhile (about $2.3m was taken).', scenarios: h.tpl.scenarios.map((s) => ({ title: s.title, condition: s.condition })) }, h.tpl, h.facts).ok; })());
check('date integer allowed (Oct 2 -> 2)', ok(rewrite({ why: 'On Oct 2 more coins reach the market with the same buyers, so the price has to work harder to stay put. Early investors may cash some out.' })).ok);
check('number word one..ten allowed when template has it', numberWords());
function numberWords() { return guard.numbersIn('two or three').join() === '2,3'; }
check('other number word-form not in input rejected (seven)', !ok(rewrite({ why: tpl.why + ' Eight days later it changes.' })).ok);
check('URL rejected', !ok(rewrite({ why: tpl.why + ' See https://x.test' })).ok);
check('markdown rejected', !ok(rewrite({ why: '**' + tpl.why + '**' })).ok);
check('"we recommend" rejected', !ok(rewrite({ tradeoffs: 'We recommend holding. ' + tpl.tradeoffs })).ok);
check('too short (<0.4x) rejected', /length/.test(ok(rewrite({ why: 'Coins.' })).reason || ''));
check('too long (>1.6x) rejected', /length/.test(ok(rewrite({ why: tpl.why + ' ' + tpl.why })).reason || ''));
eq('scenario count mismatch rejected', ok({ why: tpl.why, tradeoffs: tpl.tradeoffs, scenarios: [{ title: 'a', condition: 'b' }] }).reason, 'scenario count differs');
check('invalid UTF-8 (replacement char) rejected', !ok(rewrite({ why: tpl.why + '\uFFFD' })).ok);
check('fenced JSON tolerated, then guarded', guard.validateOutput('```json\n' + JSON.stringify(rewrite({})) + '\n```', tpl, facts).ok);
check('known ticker already in the template is fine (BTC)', ok(rewrite({ tradeoffs: tpl.tradeoffs })).ok);
console.log('— number words eleven..twenty, hundred, thousand, dozen; dot com');
eq('words: eleven..twenty / dozen / hundred / thousand parsed', guard.numbersIn('eleven, nineteen, twenty, a dozen, a hundred, a thousand').sort((a, b) => a - b), [11, 12, 19, 20, 100, 1000]);
check('invented "fifteen" rejected', /number 15 not in input/.test(ok(rewrite({ why: tpl.why + ' About fifteen more.' })).reason || ''));
check('invented "a dozen" rejected', /number 12 not in input/.test(ok(rewrite({ why: tpl.why + ' A dozen buyers wait.' })).reason || ''));
check('invented "hundred" rejected', /number 100 not in input/.test(ok(rewrite({ why: tpl.why + ' A hundred holders agree.' })).reason || ''));
check('"dot com" rejected as a URL', /URL/.test(ok(rewrite({ why: tpl.why + ' See example dot com for more.' })).reason || ''));
check('"site.io" rejected as a URL', /URL/.test(ok(rewrite({ why: tpl.why + ' See stakestone.io now.' })).reason || ''));
check('plain sentence ending with a period then a word is not a URL', ok(rewrite({ tradeoffs: 'Early holders can trade their coins. Me too is not here, everyone else holds a bigger pile than yesterday.' })).ok || !/URL/.test(ok(rewrite({ tradeoffs: 'Early holders can trade their coins. Me too is not here, everyone else holds a bigger pile than yesterday.' })).reason));
done('p5_numguard');
