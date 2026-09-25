// Shared, pure classifier for the coin-page source tabs (News / Exchange / Official / Social / Media)
// and for the "hide low-importance Google News" feed toggle.
//
// Plain CommonJS (no TS syntax) so it loads unmodified both from the Next.js app (via allowJs +
// the sourceTab.d.ts type declarations next to this file) and from the Node test suites
// (`require(APP + '/src/lib/sourceTab.js')`), keeping exactly one implementation of these rules.
//
// Kept in sync with app/src/app/api/coin/[ticker]/route.ts, which translates the same rules into
// a Prisma `where` clause (see the comment there for why).

/**
 * @param {{kind?: string|null, sourceName?: string|null}} post
 * @returns {'news'|'exchange'|'official'|'social'|'media'}
 */
function sourceTab(post) {
  const kind = (post && post.kind) || "";
  const sourceName = (post && post.sourceName) || "";

  if (kind === "media") return "media";
  if (kind === "social") return "social";
  if (kind === "official" || kind === "blog" || sourceName.startsWith("blog:")) return "official";
  if (kind === "exchange" || kind === "symbol") return "exchange";
  return "news";
}

/**
 * True when a post should be hidden by the main feed's "Hide low-importance Google News" toggle:
 * a Google News item (sourceName starting with "gnews:") whose importance is below 30.
 * @param {{sourceName?: string|null, importance?: number|null}} post
 * @returns {boolean}
 */
function hideLowImportanceGnews(post) {
  const sourceName = (post && post.sourceName) || "";
  const importance = post && typeof post.importance === "number" ? post.importance : 0;
  return sourceName.startsWith("gnews:") && importance < 30;
}

const SOURCE_TABS = ["news", "exchange", "official", "social", "media"];

module.exports = { sourceTab, hideLowImportanceGnews, SOURCE_TABS };
