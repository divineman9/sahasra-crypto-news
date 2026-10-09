'use strict';

const systemicRisk = require('./systemicRisk');

function outletKeyFromSourceName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase();
  s = s.replace(/^(tg|x|rss|gnews):\s*/, '');
  s = s.replace(/^www\./, '');
  return s;
}

function outletKey(row) {
  const base = (row.sourceDomain || row.sourceName || '');
  let s = String(base).toLowerCase();
  s = s.replace(/^(tg|x|rss|gnews):\s*/, '');
  s = s.replace(/^www\./, '');
  return s;
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
}

async function boost(prisma, raw, cls, now) {
  try {
    if (!cls || cls.category !== 'systemic_risk' || !cls.systemic || !cls.systemic.figureId) {
      return cls;
    }

    const rows = await prisma.post.findMany({
      where: {
        category: 'systemic_risk',
        firstSeenAt: { gte: new Date(now.getTime() - 6 * 3600 * 1000) }
      },
      select: { title: true, sourceName: true, sourceDomain: true, sourceTier: true },
      take: 300
    });

    const outlets = new Set();
    const topOutlets = new Set();

    for (const row of rows) {
      const fig = systemicRisk.matchFigure(row.title);
      if (!fig || fig.id !== cls.systemic.figureId) continue;
      const key = outletKey(row);
      if (!key) continue;
      outlets.add(key);
      if (row.sourceTier != null && row.sourceTier <= 2) topOutlets.add(key);
    }

    // Add current item
    let selfKey = raw.sourceDomain || hostFromUrl(raw.url) || raw.sourceName || '';
    selfKey = outletKeyFromSourceName(selfKey);
    if (selfKey) {
      outlets.add(selfKey);
      if (raw.sourceTier != null && raw.sourceTier <= 2) topOutlets.add(selfKey);
    }

    const outletsCount = outlets.size;
    const topCount = topOutlets.size;

    cls.systemic.heat = {
      outlets: outletsCount,
      top: topCount,
      trending: outletsCount >= 5
    };

    if (outletsCount >= 5 && topCount >= 2) {
      cls.importance = Math.min(100, cls.importance + 10);
      cls.systemic.heat.boosted = true;
    }

    return cls;
  } catch (e) {
    return cls;
  }
}

module.exports = { boost };