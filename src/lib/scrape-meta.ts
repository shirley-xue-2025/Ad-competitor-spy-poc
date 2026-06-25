import type { CrawlCacheEntry } from './crawl-cache.js';
import { previewFromCrawlEntry, productImageFromCrawlEntry } from './preview-image.js';
import type { ReportItem } from '../types/report.js';

export function scrapeMetaFromCache(
  entry: CrawlCacheEntry,
  pageUrl: string,
  productEntry?: CrawlCacheEntry | null,
): NonNullable<ReportItem['scrape']> {
  const productSource = productEntry ?? entry;
  return {
    crawlRunId: entry.crawlRunId,
    pageTitle: entry.pageTitle,
    markdownLength: entry.markdown.length,
    loadedUrl: entry.loadedUrl,
    previewImageUrl: previewFromCrawlEntry(entry, pageUrl),
    productImageUrl: productImageFromCrawlEntry(productSource, pageUrl),
    productTitle: productSource.productTitle ?? entry.productTitle,
    productPrice: productSource.productPrice ?? entry.productPrice,
  };
}
