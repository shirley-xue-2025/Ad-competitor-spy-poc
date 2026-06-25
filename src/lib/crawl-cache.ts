import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { OUTPUT_DIR } from '../config.js';
import type { DeepScrapeResult } from './deep-scrape.js';

export type CrawlCacheEntry = {
  url: string;
  markdown: string;
  pageTitle: string | null;
  loadedUrl: string | null;
  crawlRunId: string;
  cachedAt: string;
};

export type CrawlCacheFile = {
  updatedAt: string;
  entries: Record<string, CrawlCacheEntry>;
};

const CACHE_PATH = path.join(OUTPUT_DIR, 'crawl-cache.json');

function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.protocol = 'https:';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, '').toLowerCase();
  }
}

export async function loadCrawlCache(): Promise<Map<string, CrawlCacheEntry>> {
  try {
    const raw = await readFile(CACHE_PATH, 'utf8');
    const data = JSON.parse(raw) as CrawlCacheFile;
    const map = new Map<string, CrawlCacheEntry>();
    for (const entry of Object.values(data.entries)) {
      map.set(normalizeUrlKey(entry.url), entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function saveCrawlCache(map: Map<string, CrawlCacheEntry>): Promise<void> {
  const entries: Record<string, CrawlCacheEntry> = {};
  for (const [key, entry] of map) {
    entries[key] = entry;
  }
  const payload: CrawlCacheFile = {
    updatedAt: new Date().toISOString(),
    entries,
  };
  await writeFile(CACHE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function cacheKeyForUrl(url: string): string {
  return normalizeUrlKey(url);
}

export function cacheEntryFromScrape(url: string, scrape: DeepScrapeResult): CrawlCacheEntry {
  return {
    url,
    markdown: scrape.markdown,
    pageTitle: scrape.pageTitle,
    loadedUrl: scrape.loadedUrl,
    crawlRunId: scrape.crawlRunId,
    cachedAt: new Date().toISOString(),
  };
}
