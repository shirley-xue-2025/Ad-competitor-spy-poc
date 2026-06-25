import type { ApifyClient } from 'apify-client';

import { MIN_LANDING_MARKDOWN_CHARS } from '../config.js';
import { validateLandingMarkdown } from './validate-scrape.js';

export const WEBSITE_CRAWLER_ACTOR = 'apify/website-content-crawler' as const;

type CrawlDatasetItem = {
  url?: string;
  markdown?: string;
  text?: string;
  metadata?: {
    title?: string;
  };
  crawl?: {
    loadedUrl?: string;
  };
};

export type DeepScrapeResult = {
  markdown: string;
  pageTitle: string | null;
  loadedUrl: string | null;
  crawlRunId: string;
};

const COOKIE_CLICK_SELECTOR = [
  '#onetrust-accept-btn-handler',
  'button[data-testid="uc-accept-all-button"]',
  'button[id*="accept"]',
  'button[class*="accept"]',
  'a.cc-btn.cc-dismiss',
  '.cmpboxbtn.cmpboxbtnyes',
  'button[aria-label*="Accept"]',
  'button[aria-label*="Akzeptieren"]',
  'button[aria-label*="Alle akzeptieren"]',
].join(', ');

function buildCrawlerInput(urls: string[]) {
  return {
    startUrls: urls.map((url) => ({ url })),
    crawlerType: 'playwright:firefox',
    maxCrawlDepth: 0,
    maxCrawlPages: urls.length,
    maxResults: urls.length,
    saveMarkdown: true,
    dynamicContentWaitSecs: 12,
    removeCookieWarnings: true,
    clickElementsCssSelector: COOKIE_CLICK_SELECTOR,
    proxyConfiguration: {
      useApifyProxy: true,
    },
  };
}

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

function itemToResult(
  item: CrawlDatasetItem,
  crawlRunId: string,
  requestedUrl: string,
): DeepScrapeResult {
  const markdown = (item.markdown ?? item.text ?? '').trim();
  const validation = validateLandingMarkdown(markdown, MIN_LANDING_MARKDOWN_CHARS);
  if (!validation.valid) {
    throw new Error(validation.reason ?? 'Landing page content failed quality check.');
  }

  return {
    markdown,
    pageTitle: item.metadata?.title ?? null,
    loadedUrl: item.crawl?.loadedUrl ?? item.url ?? requestedUrl,
    crawlRunId,
  };
}

/** Batch-scrape multiple landing pages in ONE Actor run (saves Apify memory quota). */
export async function scrapeLandingPagesBatch(
  client: ApifyClient,
  urls: string[],
): Promise<Map<string, DeepScrapeResult>> {
  if (urls.length === 0) {
    return new Map();
  }

  const run = await client.actor(WEBSITE_CRAWLER_ACTOR).call(buildCrawlerInput(urls));
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: urls.length + 5 });

  const results = new Map<string, DeepScrapeResult>();
  const requestedKeys = new Map(urls.map((url) => [normalizeUrlKey(url), url]));

  for (const raw of items) {
    const item = raw as CrawlDatasetItem;
    const candidateUrls = [item.crawl?.loadedUrl, item.url].filter(Boolean) as string[];

    for (const candidate of candidateUrls) {
      const key = normalizeUrlKey(candidate);
      const requested = requestedKeys.get(key);
      if (!requested || results.has(requested)) {
        continue;
      }

      try {
        results.set(requested, itemToResult(item, run.id, requested));
      } catch {
        // invalid markdown for this item — skip
      }
    }
  }

  return results;
}

export async function scrapeLandingPageMarkdown(
  client: ApifyClient,
  url: string,
): Promise<DeepScrapeResult> {
  const batch = await scrapeLandingPagesBatch(client, [url]);
  const result = batch.get(url);
  if (!result) {
    throw new Error('Crawler returned empty or low-quality markdown for this URL.');
  }
  return result;
}
