import type { Kind } from "./types";

export type SourceTab = "news" | "exchange" | "official" | "social" | "media";

export const SOURCE_TABS: readonly SourceTab[];

export function sourceTab(post: { kind?: Kind | string | null; sourceName?: string | null }): SourceTab;

export function hideLowImportanceGnews(post: {
  sourceName?: string | null;
  importance?: number | null;
}): boolean;
