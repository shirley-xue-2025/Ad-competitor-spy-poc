/**
 * Recompute previewImageUrl in final_report from crawl-cache (no LLM / Apify).
 * Run: VERTICAL=ac tsx src/refresh-previews.ts
 */
import 'dotenv/config';

import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { OUTPUT_DIR } from './config.js';
import { loadCrawlCache, cacheKeyForUrl } from './lib/crawl-cache.js';
import { scrapeMetaFromCache } from './lib/scrape-meta.js';
import { productImageWithFallback } from './lib/preview-image.js';
import type { FinalReport } from './types/report.js';

const OUTPUT_COPY = 'output/final_report.json';

async function main(): Promise<void> {
  const reportPath = path.join(OUTPUT_DIR, 'final_report.json');
  const raw = await readFile(reportPath, 'utf8');
  const report = JSON.parse(raw) as FinalReport;
  const cache = await loadCrawlCache();

  let updated = 0;
  for (const item of [...report.items, ...report.skipped]) {
    const urls = [item.ad.landingPageUrl, item.ad.productPageUrl].filter(Boolean) as string[];
    if (!item.scrape || urls.length === 0) {
      continue;
    }
    const url = item.ad.landingPageUrl ?? urls[0];
    const cached = cache.get(cacheKeyForUrl(url));
    if (!cached) {
      continue;
    }

    const productUrl = item.ad.productPageUrl;
    const productCached =
      productUrl && productUrl !== url ? cache.get(cacheKeyForUrl(productUrl)) : null;
    const next = scrapeMetaFromCache(cached, url, productCached);
    const changed =
      next.previewImageUrl !== item.scrape.previewImageUrl ||
      next.productImageUrl !== item.scrape.productImageUrl ||
      next.productTitle !== item.scrape.productTitle ||
      next.productPrice !== item.scrape.productPrice;

    if (changed) {
      item.scrape = { ...item.scrape, ...next };
      updated += 1;
    }
    if (item.scrape) {
      const product = productImageWithFallback(item.scrape, item.ad.creativeUrl);
      if (product !== item.scrape.productImageUrl) {
        item.scrape.productImageUrl = product;
        updated += 1;
      }
    }
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await copyFile(reportPath, path.resolve(OUTPUT_COPY));
  console.log(`Updated ${updated} items -> ${reportPath} (+ ${OUTPUT_COPY})`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
