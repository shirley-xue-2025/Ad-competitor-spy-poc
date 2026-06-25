/**
 * Recompute previewImageUrl in final_report from crawl-cache (no LLM / Apify).
 * Run: VERTICAL=ac tsx src/refresh-previews.ts
 */
import 'dotenv/config';

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { OUTPUT_DIR } from './config.js';
import { loadCrawlCache, cacheKeyForUrl } from './lib/crawl-cache.js';
import {
  extractPreviewImageFromMarkdown,
  isLikelyUiIconUrl,
  landingPreviewFallbackUrl,
} from './lib/preview-image.js';
import type { FinalReport } from './types/report.js';

async function main(): Promise<void> {
  const reportPath = path.join(OUTPUT_DIR, 'final_report.json');
  const raw = await readFile(reportPath, 'utf8');
  const report = JSON.parse(raw) as FinalReport;
  const cache = await loadCrawlCache();

  let updated = 0;
  for (const item of report.items) {
    const url = item.ad.landingPageUrl;
    if (!url || !item.scrape) {
      continue;
    }
    const cached = cache.get(cacheKeyForUrl(url));
    const fromMarkdown = cached
      ? extractPreviewImageFromMarkdown(cached.markdown)
      : item.scrape.previewImageUrl;

    let preview = fromMarkdown;
    if (isLikelyUiIconUrl(preview)) {
      preview = landingPreviewFallbackUrl(url);
    }

    if (preview && preview !== item.scrape.previewImageUrl) {
      item.scrape.previewImageUrl = preview;
      updated += 1;
    }
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Updated ${updated}/${report.items.length} preview URLs -> ${reportPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
