// P5 P2: plain-words glossary for the explain cards (about 25 terms). Funding rate / open interest are
// shown only when the private heat line is present (EXPLAIN_PRIVATE).
export interface GlossaryEntry {
  term: string;
  def: string;
  privateOnly?: boolean;
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: "circulating supply", def: "The coins that exist and are free to trade today." },
  { term: "total supply", def: "Every coin that exists now, including coins still locked." },
  { term: "cliff unlock", def: "A day when a big batch of locked coins is released all at once." },
  { term: "token unlock", def: "Locked coins becoming free to trade on a set date." },
  { term: "vesting", def: "A schedule that releases locked coins to the team or investors bit by bit." },
  { term: "supply shock", def: "A sudden jump in how many coins are available to trade." },
  { term: "stablecoin", def: "A coin built to stay at one price, usually one US dollar." },
  { term: "depeg", def: "When a stablecoin slips away from the price it promises." },
  { term: "peg", def: "The fixed price a stablecoin promises to hold." },
  { term: "exploit", def: "Using a flaw in a program's code to take money or break its rules." },
  { term: "stolen funds", def: "Money taken without permission, for example by a hacker." },
  { term: "withdrawals paused", def: "People cannot take their coins out for now." },
  { term: "trading halt", def: "Trading is stopped for a while." },
  { term: "listing", def: "A coin becoming available to trade on an exchange." },
  { term: "delisting", def: "An exchange removing a coin so it can no longer be traded there." },
  { term: "liquidity", def: "How easily a coin can be traded without moving its price much." },
  { term: "redemption", def: "Swapping a stablecoin back for the money it stands for." },
  { term: "reserves", def: "The money or assets held to back a stablecoin." },
  { term: "market cap", def: "The price of one coin times the number of coins in circulation." },
  { term: "perpetual contract", def: "A bet on a coin's price that has no end date." },
  { term: "spot", def: "Buying or holding the real coin, not a bet on its price." },
  { term: "ETF", def: "A fund you can trade like a share that holds an asset such as a coin." },
  { term: "regulation", def: "Rules from governments or watchdogs about what is allowed." },
  { term: "volatility", def: "How much and how fast a price moves up and down." },
  { term: "on-chain", def: "Recorded on the blockchain where anyone can check it." },
  { term: "funding rate", def: "A small payment between traders that keeps a perpetual contract near the real price.", privateOnly: true },
  { term: "open interest", def: "The total size of bets that are still open on a coin.", privateOnly: true },
];

export function glossaryFor(term: string, showPrivate: boolean): GlossaryEntry | null {
  const t = term.toLowerCase();
  const e = GLOSSARY.find((g) => g.term.toLowerCase() === t);
  if (!e || (e.privateOnly && !showPrivate)) return null;
  return e;
}

// Split text into plain and glossary segments (longest term first, whole words, case-insensitive).
export function splitGlossary(text: string, showPrivate: boolean): { text: string; entry: GlossaryEntry | null }[] {
  const terms = GLOSSARY.filter((g) => showPrivate || !g.privateOnly).sort((a, b) => b.term.length - a.term.length);
  if (!text || terms.length === 0) return [{ text, entry: null }];
  const esc = terms.map((g) => g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![A-Za-z])(${esc.join("|")})(?![A-Za-z])`, "gi");
  const out: { text: string; entry: GlossaryEntry | null }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), entry: null });
    out.push({ text: m[0], entry: terms.find((g) => g.term.toLowerCase() === m![0].toLowerCase()) ?? null });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), entry: null });
  return out;
}
