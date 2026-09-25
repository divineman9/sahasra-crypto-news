import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePost } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RANGE_MS: Record<"48h" | "7d", number> = {
  "48h": 48 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  let limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  if (Number.isNaN(limit)) limit = 20;
  limit = Math.min(100, Math.max(1, limit));
  // Default stays 48h for backward compatibility with any other caller of this route that doesn't
  // pass `range` — the feed itself asks for 7d once it starts paging (see fetchOlder in feedApi.ts).
  const range: "48h" | "7d" = url.searchParams.get("range") === "7d" ? "7d" : "48h";

  try {
    let cursorRow: { id: string; firstSeenAt: Date } | null = null;
    if (cursor) {
      cursorRow = await prisma.post.findUnique({
        where: { id: cursor },
        select: { id: true, firstSeenAt: true },
      });
      if (!cursorRow) {
        return NextResponse.json({ error: "invalid cursor" }, { status: 400 });
      }
    }

    const windowWhere = { publishedAt: { gte: new Date(Date.now() - RANGE_MS[range]) } };

    // Explicit keyset on (firstSeenAt desc, id desc) instead of Prisma's `cursor: {id}, skip: 1`:
    // skip-1 assumes the cursor row itself still matches `where`, which isn't guaranteed once a
    // narrower/older `range` is combined with pagination (or the row simply aged out of the window
    // between requests) — in that case Prisma's cursor+OFFSET silently drops the row right after the
    // missing cursor instead of returning it (the same bug Fable found and fixed in /api/coin). An
    // explicit "strictly before the cursor's (firstSeenAt, id)" filter has no such failure mode: it
    // only depends on the cursor row's own timestamp/id, never on whether it still matches `where`.
    const pageWhere = cursorRow
      ? {
          AND: [
            windowWhere,
            {
              OR: [
                { firstSeenAt: { lt: cursorRow.firstSeenAt } },
                { firstSeenAt: cursorRow.firstSeenAt, id: { lt: cursorRow.id } },
              ],
            },
          ],
        }
      : windowWhere;

    const rows = await prisma.post.findMany({
      where: pageWhere,
      orderBy: [{ firstSeenAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { instruments: true, votes: true },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].id : null;

    return NextResponse.json(
      { posts: page.map(serializePost), nextCursor, range },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[api/posts] database error:", err);
    return NextResponse.json({ error: "database unavailable" }, { status: 500 });
  }
}