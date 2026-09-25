import { useFeedStore } from "@/store/useFeedStore";
import type { PostDTO } from "@/lib/types";

function isPostDTO(x: unknown): x is PostDTO {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.publishedAt === "string" &&
    Array.isArray(o.instruments) &&
    typeof o.votes === "object" &&
    o.votes !== null
  );
}

export async function fetchLatest(): Promise<void> {
  try {
    const res = await fetch("/api/posts?limit=50", { cache: "no-store" });
    if (!res.ok) throw new Error(`fetchLatest failed: ${res.status}`);
    const data: unknown = await res.json();
    const payload = data as { posts?: unknown[]; nextCursor?: string | null } | null;
    const posts = Array.isArray(payload?.posts)
      ? (payload.posts as unknown[]).filter(isPostDTO)
      : [];
    if (posts.length > 0) {
      useFeedStore.getState().hydrate(posts);
    }
    if (useFeedStore.getState().nextCursor === undefined) {
      useFeedStore.getState().setNextCursor(payload?.nextCursor ?? null);
    }
  } catch (err) {
    console.warn("fetchLatest error", err);
  }
}

export async function fetchOlder(): Promise<void> {
  const s = useFeedStore.getState();
  if (s.loadingOlder || !s.nextCursor) return;
  useFeedStore.getState().setLoadingOlder(true);
  try {
    const res = await fetch(
      `/api/posts?limit=50&cursor=${encodeURIComponent(s.nextCursor)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data: unknown = await res.json();
      const payload = data as { posts?: unknown[]; nextCursor?: string | null } | null;
      const posts = Array.isArray(payload?.posts)
        ? (payload.posts as unknown[]).filter(isPostDTO)
        : [];
      if (posts.length > 0) {
        useFeedStore.getState().hydrate(posts);
      }
      useFeedStore.getState().setNextCursor(payload?.nextCursor ?? null);
    } else if (res.status === 400) {
      useFeedStore.getState().setNextCursor(null);
    } else {
      throw new Error(`fetchOlder failed: ${res.status}`);
    }
  } catch (err) {
    console.warn("fetchOlder error", err);
  } finally {
    useFeedStore.getState().setLoadingOlder(false);
  }
}