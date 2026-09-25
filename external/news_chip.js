"use strict";
(function () {
  if (/(^|[?&])feed=stocks(&|$)/.test(location.search)) return;

  var NEWS = null;
  var lastFetchOk = 0;
  var TABLE_SELECTOR = "#topTable, #fastTable, #ltfTable, #setupTable, #firstLtfTable, #firstBarTable";
  var STALE_MS = 60000;
  var MAX_AGE_MS = 48 * 3600e3;

  function baseOf(name) {
    var s = (name || "").toUpperCase();
    if (/USDT$/.test(s)) s = s.slice(0, -4);
    else if (/USDC$/.test(s)) s = s.slice(0, -4);
    if (/^1000000/.test(s)) s = s.slice(7);
    else if (/^1000/.test(s)) s = s.slice(4);
    return s;
  }

  function ageText(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return "";
    var mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (mins < 60) return mins + "m";
    var hours = Math.floor(mins / 60);
    if (hours < 48) return hours + "h";
    return Math.floor(hours / 24) + "d";
  }

  function dayText(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function isStale() {
    if (!NEWS) return true;
    if (Date.now() - NEWS.asof_ms > STALE_MS) return true;
    if (Date.now() - lastFetchOk > STALE_MS) return true;
    return false;
  }

  function banner() {
    var el = document.getElementById("newsChipBanner");
    if (!el) {
      el = document.createElement("div");
      el.id = "newsChipBanner";
      el.style.position = "fixed";
      el.style.top = "8px";
      el.style.right = "8px";
      el.style.fontSize = "11px";
      el.style.padding = "3px 8px";
      el.style.borderRadius = "4px";
      el.style.zIndex = "9999";
      el.style.background = "rgba(12,16,32,.92)";
      el.style.backdropFilter = "blur(6px)";
      el.style.fontFamily = "'JetBrains Mono', ui-monospace, Consolas, monospace";
      document.body.appendChild(el);
    }
    return el;
  }

  function showBanner() {
    var el = banner();
    if (isStale()) {
      el.textContent = "📰 news feed stale — chips hidden" + (NEWS ? " (last update " + ageText(NEWS.asof) + " ago)" : "");
      el.style.border = "1px solid var(--muted)";
      el.style.color = "var(--muted)";
      el.style.boxShadow = "none";
      el.style.display = "";
      removeAllChips();
      return true;
    }
    if (NEWS.health && NEWS.health.known && !NEWS.health.ok) {
      el.textContent = "📰 news coverage degraded: " + NEWS.health.stale.join(", ");
      el.style.border = "1px solid var(--amber, #ffb000)";
      el.style.color = "var(--amber, #ffb000)";
      el.style.boxShadow = "0 0 10px rgba(255,176,0,.45)";
      el.style.textShadow = "0 0 6px rgba(255,176,0,.7)";
      el.style.display = "";
      return false;
    }
    el.style.display = "none";
    return false;
  }

  function removeAllChips() {
    var chips = document.querySelectorAll(".news-chip");
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].parentNode) chips[i].parentNode.removeChild(chips[i]);
    }
  }

  function fresh(item) {
    if (!item || !item.publishedAt) return false;
    var t = Date.parse(item.publishedAt);
    if (isNaN(t)) return false;
    if (Date.now() - t > MAX_AGE_MS) return false;
    if (t > Date.now() + 5 * 60e3) return false;
    return true;
  }

  function ensureStyle() {
    if (document.getElementById("newsChipStyle")) return;
    var st = document.createElement("style");
    st.id = "newsChipStyle";
    st.textContent = "@keyframes newsChipPulse{0%,100%{box-shadow:0 0 6px rgba(255,56,96,.45),inset 0 0 6px rgba(255,56,96,.15)}50%{box-shadow:0 0 14px rgba(255,56,96,.85),inset 0 0 8px rgba(255,56,96,.3)}}@media (prefers-reduced-motion:reduce){.news-chip{animation:none!important}}.news-chip:hover{filter:brightness(1.25)}";
    document.head.appendChild(st);
  }

  function chip(item, kind, others) {
    ensureStyle();
    var col;
    var glow;
    if (kind === "risk") {
      col = "var(--red, #ff3860)";
      glow = "255,56,96";
    } else if (kind === "catalyst") {
      col = "var(--lime, #39ff14)";
      glow = "57,255,20";
    } else {
      col = "var(--amber, #ffb000)";
      glow = "255,176,0";
    }

    var el = document.createElement("a");
    el.className = "badge news-chip";
    el.target = "_blank";
    el.rel = "noopener";
    el.href = "http://127.0.0.1:4180/post/" + item.id;
    el.style.background = "rgba(" + glow + ",.08)";
    el.style.border = "1px solid " + col;
    el.style.color = col;
    el.style.cursor = "pointer";
    el.style.textDecoration = "none";
    el.style.marginLeft = "4px";
    el.style.boxShadow = "0 0 8px rgba(" + glow + ",.45), inset 0 0 6px rgba(" + glow + ",.15)";
    el.style.textShadow = "0 0 6px rgba(" + glow + ",.8)";
    el.style.fontWeight = "600";
    if (kind === "risk") el.style.animation = "newsChipPulse 2s ease-in-out infinite";

    if (kind === "risk") {
      el.appendChild(document.createTextNode("⚠ " + item.category.toUpperCase() + " · " + ageText(item.publishedAt) + " ago"));
    } else {
      el.appendChild(document.createTextNode("📰 " + item.category.toUpperCase() + " · " + ageText(item.publishedAt) + " ago · " + dayText(item.publishedAt)));
    }

    var lines = ["[" + item.category.toUpperCase() + " " + item.importance + "] " + item.title + " — " + item.source + " · " + ageText(item.publishedAt) + " ago"];
    if (others && others.length) {
      for (var i = 0; i < others.length; i++) {
        lines.push("[" + others[i].category.toUpperCase() + " " + others[i].importance + "] " + others[i].title + " — " + others[i].source + " · " + ageText(others[i].publishedAt) + " ago");
      }
    }
    lines.push("Click to open in the news terminal (news ≤48h, importance ≥50)");
    el.title = lines.join("\n");

    return el;
  }

  function newsChip(f) {
    ensureStyle();
    var latest = f.newsLatest[0];
    var el = document.createElement("a");
    el.className = "badge news-chip news-chip-neutral";
    el.target = "_blank";
    el.rel = "noopener";
    el.href = "http://127.0.0.1:4180/post/" + latest.id;
    el.style.background = "rgba(138,147,166,.08)";
    el.style.border = "1px solid var(--muted, #8a93a6)";
    el.style.color = "var(--muted, #8a93a6)";
    el.style.cursor = "pointer";
    el.style.textDecoration = "none";
    el.style.marginLeft = "4px";
    el.style.fontWeight = "500";
    el.appendChild(document.createTextNode("📰 " + f.newsCount48h));
    var lines = [f.newsCount48h + " news items ≤48h (no risk/catalyst flag)"];
    for (var i = 0; i < f.newsLatest.length; i++) {
      var it = f.newsLatest[i];
      lines.push("[" + String(it.category || "").toUpperCase() + " " + it.importance + "] " + it.title + " — " + it.source + " · " + ageText(it.publishedAt) + " ago");
    }
    lines.push("Click to open in the news terminal");
    el.title = lines.join("\n");
    return el;
  }

  function apply() {
    try {
      if (showBanner()) return;
      if (!NEWS) return;
      var tables = document.querySelectorAll(TABLE_SELECTOR);
      for (var i = 0; i < tables.length; i++) {
        var rows = tables[i].querySelectorAll("tbody tr");
        for (var r = 0; r < rows.length; r++) {
          var tr = rows[r];
          var a = tr.querySelector("td:first-child a");
          if (!a) continue;
          var base = baseOf(a.textContent.trim());
          var f = NEWS.flags[base];
          if (!f) {
            removeRowChips(tr);
            continue;
          }

          var riskF = fresh(f.risk) ? f.risk : null;
          var catF = fresh(f.catalyst) ? f.catalyst : null;
          var othF = fresh(f.other) ? f.other : null;

          var shown = [];
          if (riskF) shown.push({ item: riskF, kind: "risk" });
          if (catF && (!riskF || riskF.id !== catF.id)) shown.push({ item: catF, kind: "catalyst" });
          if (othF && !riskF && !catF) shown.push({ item: othF, kind: "other" });

          if (!shown.length) {
            if (typeof f.newsCount48h === "number" && f.newsCount48h > 0 && f.newsLatest && f.newsLatest.length && fresh(f.newsLatest[0])) {
              var nkey = "news:" + f.newsCount48h + ":" + f.newsLatest[0].id + "|" + Math.floor(Date.now() / 60000);
              var nexisting = tr.querySelector(".news-chip");
              if (nexisting && nexisting.getAttribute("data-key") === nkey) continue;
              removeRowChips(tr);
              var nhost = tr.children[3] || tr.querySelector("td:first-child");
              if (!nhost) continue;
              var nel = newsChip(f);
              nel.setAttribute("data-key", nkey);
              nhost.appendChild(nel);
            } else {
              removeRowChips(tr);
            }
            continue;
          }

          var ids = [];
          for (var s = 0; s < shown.length; s++) ids.push(shown[s].item.id);
          var key = ids.join(",") + "|" + Math.floor(Date.now() / 60000);

          var existing = tr.querySelector(".news-chip");
          if (existing && existing.getAttribute("data-key") === key) continue;
          removeRowChips(tr);

          var host = tr.children[3] || tr.querySelector("td:first-child");
          if (!host) continue;

          var others = [];
          for (var o = 0; o < f.items.length; o++) {
            if (fresh(f.items[o]) && f.items[o].id !== shown[0].item.id) others.push(f.items[o]);
          }

          for (var c = 0; c < shown.length; c++) {
            var el = chip(shown[c].item, shown[c].kind, c === 0 ? others : null);
            if (c === 0) el.setAttribute("data-key", key);
            host.appendChild(el);
          }
        }
      }
    } catch (e) { /* swallow */ }
  }

  function removeRowChips(tr) {
    var chips = tr.querySelectorAll(".news-chip");
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].parentNode) chips[i].parentNode.removeChild(chips[i]);
    }
  }

  function load() {
    fetch("news_live.json?_=" + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.flags && j.schema === 2) {
          NEWS = j;
          lastFetchOk = Date.now();
        }
        apply();
      })
      .catch(function () { apply(); });
  }

  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      apply();
    }, 150);
  }

  function allOwn(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      var j, n;
      for (j = 0; j < m.addedNodes.length; j++) {
        n = m.addedNodes[j];
        if (n !== document.getElementById("newsChipBanner") && !(n.classList && n.classList.contains("news-chip"))) return false;
      }
      for (j = 0; j < m.removedNodes.length; j++) {
        n = m.removedNodes[j];
        if (n !== document.getElementById("newsChipBanner") && !(n.classList && n.classList.contains("news-chip"))) return false;
      }
    }
    return true;
  }

  new MutationObserver(function (mutations) {
    if (allOwn(mutations)) return;
    schedule();
  }).observe(document.body, { childList: true, subtree: true });

  load();
  setInterval(load, 15000);
  setInterval(apply, 30000);
})();