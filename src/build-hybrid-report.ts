/**
 * Build a browseable AC report without LLM — uses scrape + crawl cache only.
 * Run: VERTICAL=ac tsx src/build-hybrid-report.ts
 */

import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { OUTPUT_DIR, VERTICAL_ID, VERTICAL_LABEL } from './config.js';
import { extractPreviewImageFromMarkdown } from './lib/preview-image.js';
import { loadAdsInput, pickAdsForDeepAnalysis, resolveAdsInputPath } from './lib/read-ads-json.js';
import type { AdsInputRecord } from './types/ads-input.js';
import type { FinalReport, ReportItem } from './types/report.js';

const TARGET_ITEMS = 12;

const AC_SIGNALS =
  /klima|kühl|kuehl|cool|split|midea|klimagerät|klimagerat|luftkühler|portable.?ac|air.?condition|klimaworld|kaeltebringer|coolfix|klimager/i;

const NOISE_SIGNALS =
  /mobile\.de|peugeot\.pkw|volkswagen|leasing.*cabrio|schraubwerk|offset.?schlüssel|werkstatt.*wartung/i;

function cacheKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.protocol = 'https:';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, '').toLowerCase();
  }
}

function scoreAd(ad: AdsInputRecord): number {
  const blob = `${ad.adBody ?? ''} ${ad.landingPageUrl ?? ''} ${ad.pageName ?? ''}`;
  let score = 0;
  if (AC_SIGNALS.test(blob)) score += 20;
  if (ad.creativeUrl) score += 5;
  if (ad.sourceKeyword?.toLowerCase().includes('klima')) score += 8;
  if (NOISE_SIGNALS.test(blob)) score -= 30;
  return score;
}

function placeholderAnalysis(ad: AdsInputRecord): ReportItem['analysis'] {
  const body = (ad.adBody ?? '').trim();
  const firstLine = body.split('\n').find((l) => l.trim().length > 10)?.trim() ?? body.slice(0, 120);
  const host = ad.pageName ?? (ad.landingPageUrl ? tryHost(ad.landingPageUrl) : '未知广告主');

  return {
    marketing_hook: `【视觉情报】${host} — 德国降温/空调品类投放（AI 分析待配额恢复后补充）`,
    form_questions: [],
    localized_translation: firstLine.slice(0, 280) || '（见下方德语广告原文）',
  };
}

function tryHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function main(): Promise<void> {
  const adsPath = await resolveAdsInputPath(process.env.ADS_INPUT_FILE);
  const adsInput = await loadAdsInput(adsPath);

  const cachePath = path.join(OUTPUT_DIR, 'crawl-cache.json');
  const cacheRaw = JSON.parse(await readFile(cachePath, 'utf8')) as {
    entries: Record<string, { url: string; markdown: string; pageTitle: string | null; loadedUrl: string | null; crawlRunId: string }>;
  };

  const cache = new Map<string, (typeof cacheRaw.entries)[string]>();
  for (const entry of Object.values(cacheRaw.entries)) {
    cache.set(cacheKey(entry.url), entry);
  }

  const candidates = pickAdsForDeepAnalysis(adsInput.ads, 80)
    .filter((ad) => ad.creativeUrl && cache.has(cacheKey(ad.landingPageUrl!)))
    .sort((a, b) => scoreAd(b) - scoreAd(a));

  const picked = candidates.slice(0, TARGET_ITEMS);

  const items: ReportItem[] = picked.map((ad) => {
    const entry = cache.get(cacheKey(ad.landingPageUrl!))!;
    return {
      status: 'success',
      error: null,
      ad,
      scrape: {
        crawlRunId: entry.crawlRunId,
        pageTitle: entry.pageTitle,
        markdownLength: entry.markdown.length,
        loadedUrl: entry.loadedUrl,
        previewImageUrl: extractPreviewImageFromMarkdown(entry.markdown),
      },
      analysis: placeholderAnalysis(ad),
    };
  });

  const report: FinalReport & { meta: FinalReport['meta'] & { hybrid?: boolean; note?: string } } = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFile: adsPath,
      targetSuccessCount: TARGET_ITEMS,
      candidatesAttempted: picked.length,
      successCount: items.length,
      failedCount: 0,
      websiteCrawlerActor: 'apify/website-content-crawler',
      llmModel: 'hybrid-scrape-only',
      vertical: VERTICAL_ID,
      verticalLabel: VERTICAL_LABEL,
      hybrid: true,
      note: 'Gemini free-tier daily limit reached; visual intel from FB scrape + landing crawl. Re-run deep-analyze:ac when quota resets for full AI hooks.',
    },
    items,
    skipped: [],
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, 'final_report.json');
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Hybrid report: ${items.length} items -> ${outPath}`);
  console.log('Sample hosts:');
  for (const item of items.slice(0, 5)) {
    console.log(`  - ${tryHost(item.ad.landingPageUrl!)} (${item.ad.pageName ?? '—'})`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
