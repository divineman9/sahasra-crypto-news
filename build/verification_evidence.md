Environment: Windows 11, Node 24, PostgreSQL 18 (localhost:5432, db cryptonews), Redis 8.0.5 in WSL Ubuntu (localhost:6379).

- `npx tsc --noEmit`: clean. `npm run build` (Next 15.5): compiled, lint + types OK, routes / static, 3 API routes dynamic.
- `npx prisma db push`: schema in sync. `npm run db:seed`: 30 instruments, 20 posts, Redis news:hot rebuilt with 20 (newest first).
- mockNews fuzz: 2000 generated articles, all have 1-3 tickers, no exceptions; ~31% of fresh posts start Hot.
- GET /api/posts?limit=3 then cursor page 2: contiguous, no overlap, newest first; invalid cursor -> 400 {"error":"invalid cursor"}.
- POST vote bullish: 5 -> 6 (exactly +1); invalid type -> 400; unknown uuid -> 404.
- GET /api/prices: live CoinGecko data for 10 coins with 24h change.
- WebSocket probe (node ws client): snapshot on connect (38 posts), live {type:"post"} every ~5s from ingest.js, and a vote via REST produced a {type:"update"} frame for the same post id.
- Browser (Chrome): top bar shows LIVE / OPEN, ticking clock; no hydration errors in console after the mounted-gate fix;
  Bearish filter -> 15 rows all bearish; portfolio BTC -> only $BTC rows, persisted in localStorage "cnt-portfolio"; removing it restores all rows;
  vote click in UI 5 -> 6; with no filter the feed grew 70 -> 72 rows in 11 s with no page refresh, new post on top.
- Known environment note: Redis runs inside WSL; WSL shuts down when idle, so Redis must be kept running (foreground process).
