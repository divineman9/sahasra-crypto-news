import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePost } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  let limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  if (Number.isNaN(limit)) limit = 20;
  limit = Math.min(100, Math.max(1, limit));

  try {
    if (cursor) {
      const exists = await prisma.post.findUnique({ where: { id: cursor }, select: { id: true } });
      if (!exists) {
        return NextResponse.json({ error: "invalid cursor" }, { status: 400 });
      }
    }

    const rows = await prisma.post.findMany({
      where: { publishedAt: { gte: new Date(Date.now() - 48 * 3600 * 1000) } },
      orderBy: [{ firstSeenAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { instruments: true, votes: true },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].id : null;

    return NextResponse.json(
      { posts: page.map(serializePost), nextCursor },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[api/posts] database error:", err);
    return NextResponse.json({ error: "database unavailable" }, { status: 500 });
  }
}