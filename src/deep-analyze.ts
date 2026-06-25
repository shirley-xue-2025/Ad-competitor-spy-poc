/**
 * Deep scrape + LLM reverse-engineering pipeline (Stage 2).
 */

import 'dotenv/config';

import { ApifyClient } from 'apify-client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEEP_ANALYZE_MAX_CANDIDATES,
  DEEP_ANALYZE_TARGET_SUCCESS,
  OUTPUT_DIR,
  VERTICAL_ID,
  VERTICAL_LABEL,
} from './config.js';
import {
  cacheEntryFromScrape,
  cacheKeyForUrl,
  loadCrawlCache,
  saveCrawlCache,
  type CrawlCacheEntry,
} from './lib/crawl-cache.js';
import {
  scrapeLandingPagesBatch,
  WEBSITE_CRAWLER_ACTOR,
} from './lib/deep-scrape.js';
import { analyzeWithLlm, getLlmModelName, getLlmProvider } from './lib/llm-analyze.js';
import { extractPreviewImageFromMarkdown } from './lib/preview-image.js';
import {
  loadAdsInput,
  pickAdsForDeepAnalysis,
  resolveAdsInputPath,
} from './lib/read-ads-json.js';
import type { ReportItem } from './types/report.js';

const CRAWL_BATCH_SIZE = 8;
const LLM_DELAY_MS = 6000;

function requireApifyToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('Missing APIFY_TOKEN. Add it to your .env file.');
  }
  return token;
}

function getTargetSuccessCount(): number {
  const raw = process.env.DEEP_ANALYZE_TARGET_SUCCESS;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return DEEP_ANALYZE_TARGET_SUCCESS;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function scrapeMetaFromCache(entry: CrawlCacheEntry): NonNullable<ReportItem['scrape']> {
  return {
    crawlRunId: entry.crawlRunId,
    pageTitle: entry.pageTitle,
    markdownLength: entry.markdown.length,
    loadedUrl: entry.loadedUrl,
    previewImageUrl: extractPreviewImageFromMarkdown(entry.markdown),
  };
}

async function ensureCrawlCache(
  client: ApifyClient,
  candidates: ReportItem['ad'][],
  cache: Map<string, CrawlCacheEntry>,
): Promise<void> {
  const uncached = candidates.filter((ad) => {
    const key = cacheKeyForUrl(ad.landingPageUrl!);
    return !cache.has(key);
  });

  if (uncached.length === 0) {
    console.log(`Crawl cache hit: all ${candidates.length} URLs already cached`);
    return;
  }

  console.log(`Crawling ${uncached.length} uncached URLs (${cache.size} already cached)`);

  for (const [batchIndex, batch] of chunk(uncached, CRAWL_BATCH_SIZE).entries()) {
    const urls = batch.map((ad) => ad.landingPageUrl!).filter(Boolean);
    console.log(`\n=== Crawl batch ${batchIndex + 1} (${urls.length} URLs) ===`);

    try {
      const scrapeMap = await scrapeLandingPagesBatch(client, urls);
      console.log(`Batch crawl: ${scrapeMap.size}/${urls.length} valid pages`);

      for (const ad of batch) {
        const url = ad.landingPageUrl!;
        const scraped = scrapeMap.get(url);
        if (scraped) {
          cache.set(cacheKeyForUrl(url), cacheEntryFromScrape(url, scraped));
        }
      }

      await saveCrawlCache(cache);
    } catch (error) {
      console.warn(`Batch crawl failed: ${errorMessage(error)}`);
    }

    await sleep(3000);
  }
}

async function main(): Promise<void> {
  const inputPath = await resolveAdsInputPath(process.env.ADS_INPUT_FILE);
  const adsInput = await loadAdsInput(inputPath);
  const targetSuccess = getTargetSuccessCount();
  const candidates = pickAdsForDeepAnalysis(adsInput.ads, DEEP_ANALYZE_MAX_CANDIDATES);

  if (candidates.length === 0) {
    throw new Error('No ads with usable landingPageUrl found in input file.');
  }

  console.log(`Vertical: ${VERTICAL_ID}`);
  console.log(`Source: ${inputPath}`);
  console.log(`Target: ${targetSuccess} valid analyses`);
  console.log(`Candidate pool: ${candidates.length} unique landing URLs`);
  console.log(`LLM provider: ${getLlmProvider()}`);
  console.log(`LLM model: ${getLlmModelName()}`);

  const client = new ApifyClient({ token: requireApifyToken() });
  const cache = await loadCrawlCache();

  await ensureCrawlCache(client, candidates, cache);

  const successes: ReportItem[] = [];
  const skipped: ReportItem[] = [];

  for (const ad of candidates) {
    if (successes.length >= targetSuccess) {
      break;
    }

    const url = ad.landingPageUrl!;
    const cached = cache.get(cacheKeyForUrl(url));

    if (!cached) {
      skipped.push({
        status: 'failed',
        error: 'No valid markdown (not cached after crawl)',
        ad,
        scrape: null,
        analysis: null,
      });
      continue;
    }

    try {
      console.log(`\n-> LLM [${successes.length + 1}/${targetSuccess}]: ${url}`);
      const analysis = await analyzeWithLlm(ad.adBody ?? '', cached.markdown);
      successes.push({
        status: 'success',
        error: null,
        ad,
        scrape: scrapeMetaFromCache(cached),
        analysis,
      });
      console.log(`  ✓ OK`);
      await sleep(LLM_DELAY_MS);
    } catch (error) {
      const message = errorMessage(error);
      console.warn(`  !! LLM failed: ${message}`);
      skipped.push({
        status: 'failed',
        error: message,
        ad,
        scrape: scrapeMetaFromCache(cached),
        analysis: null,
      });
    }
  }

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFile: inputPath,
      targetSuccessCount: targetSuccess,
      candidatesAttempted: successes.length + skipped.length,
      successCount: successes.length,
      failedCount: skipped.length,
      websiteCrawlerActor: WEBSITE_CRAWLER_ACTOR,
      llmModel: getLlmModelName(),
      crawlCacheEntries: cache.size,
      vertical: VERTICAL_ID,
      verticalLabel: VERTICAL_LABEL,
    },
    items: successes,
    skipped,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, 'final_report.json');
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\nDone. Valid analyses: ${successes.length}/${targetSuccess}`);
  console.log(`Skipped/failed: ${skipped.length}`);
  console.log(`Report -> ${outputPath}`);

  if (successes.length < targetSuccess) {
    console.warn(`Warning: only ${successes.length} valid analyses (target ${targetSuccess}).`);
    process.exitCode = successes.length > 0 ? 0 : 1;
  }
}

main().catch((error: unknown) => {
  console.error(`Deep analyze failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
