#!/bin/bash
# Runs every Phase-2 assertion suite against the isolated test DB; exits non-zero if any suite fails.
cd "$(dirname "$0")"; export NODE_PATH="D:/claude projects/crypto-news-terminal/app/node_modules"; rc=0
for t in step1_newsfile step2_extract step3_recover step3_scheduler step_redis_optional fix1 supervisor details fix2 step5_signals step5_worker step67_sources step67_debounce fix3 fix3b step1_newsfile2 step1_stocks p3_step4a p3_step4bc p3_step2_tagger p3_step3_feeds p3_step6_sources p3_step7_media_social p3_step8_look p3_step5_coin p3_allcaps p3_step7b_reddit_rss p3_step7c_bluesky p4_wide_watchlist p4_unlock p5_gate p5_merge p5_templates p5_evidence p5_devi p5_ui_look; do
  out=$(timeout 200 node $t.test.js 2>&1); code=$?
  echo "$out" | grep -E "FAIL|passed, "; [ $code -ne 0 ] && { echo ">>> $t FAILED (exit $code)"; rc=1; }
done
echo "ALL SUITES: $([ $rc -eq 0 ] && echo PASS || echo FAIL)"; exit $rc
