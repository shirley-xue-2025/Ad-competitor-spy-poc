import 'dotenv/config';

import { ApifyClient } from 'apify-client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ACTOR_ID,
  AD_LIBRARY_SORT_BY,
  COUNTRY_CODE,
  KEYWORDS,
  LIMIT_PER_SOURCE,
  MAX_ITEMS,
  OUTPUT_DIR,
  SCRAPE_AD_DETAILS,
  USE_RESIDENTIAL_PROXY,
  VERTICAL_ID,
} from './config.js';
import { buildKeywordUrls } from './lib/ad-library-url.js';
import { normalizeAds, type CleanAd, type RawAdRecord } from './lib/normalize-ad.js';

type ScrapeOutput = {
  meta: {
    scrapedAt: string;
    actorId: string;
    country: string;
    keywords: string[];
    maxItems: number;
    runId: string;
    datasetId: string;
    actorRunUrl: string;
    vertical: string;
  };
  ads: CleanAd[];
  /** Convenience list for the next pipeline step (JS-render scraper + LLM). */
  landingPageUrls: string[];
};

function requireApifyToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error(
      'Missing APIFY_TOKEN. Copy .env.example to .env and add your Apify API token.',
    );
  }
  return token;
}

function buildActorInput(keywordUrls: string[]) {
  return {
    urls: keywordUrls.map((url) => ({ url })),
    count: MAX_ITEMS,
    limitPerSource: LIMIT_PER_SOURCE,
    scrapeAdDetails: SCRAPE_AD_DETAILS,
    'scrapePageAds.activeStatus': 'active',
    'scrapePageAds.countryCode': COUNTRY_CODE,
    'scrapePageAds.sortBy': AD_LIBRARY_SORT_BY,
    runTag: `de-leadgen-${new Date().toISOString().slice(0, 10)}`,
    proxy: {
      useApifyProxy: true,
      ...(USE_RESIDENTIAL_PROXY
        ? { apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: COUNTRY_CODE }
        : { apifyProxyCountry: COUNTRY_CODE }),
    },
  };
}

function uniqueLandingPages(ads: CleanAd[]): string[] {
  return [
    ...new Set(
      ads
        .map((ad) => ad.landingPageUrl)
        .filter((url): url is string => typeof url === 'string' && url.length > 0),
    ),
  ];
}

function timestampForFilename(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const token = requireApifyToken();
  const client = new ApifyClient({ token });

  const keywordUrls = buildKeywordUrls(KEYWORDS, COUNTRY_CODE);
  const input = buildActorInput(keywordUrls);

  console.log(`Vertical: ${VERTICAL_ID}`);
  console.log(`Running actor: ${ACTOR_ID}`);
  console.log(`Keywords: ${KEYWORDS.join(', ')}`);
  console.log(`Country: ${COUNTRY_CODE}, max items: ${MAX_ITEMS}`);
  console.log(`Residential proxy: ${USE_RESIDENTIAL_PROXY ? 'on' : 'off'}`);

  const run = await client.actor(ACTOR_ID).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const ads = normalizeAds(items as RawAdRecord[]).slice(0, MAX_ITEMS);

  const output: ScrapeOutput = {
    meta: {
      scrapedAt: new Date().toISOString(),
      actorId: ACTOR_ID,
      country: COUNTRY_CODE,
      keywords: [...KEYWORDS],
      maxItems: MAX_ITEMS,
      runId: run.id,
      datasetId: run.defaultDatasetId,
      actorRunUrl: `https://console.apify.com/actors/runs/${run.id}`,
      vertical: VERTICAL_ID,
    },
    ads,
    landingPageUrls: uniqueLandingPages(ads),
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `ads-${timestampForFilename()}.json`);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Saved ${ads.length} ads to ${outputPath}`);
  console.log(`Landing pages for next step: ${output.landingPageUrls.length}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Scrape failed: ${message}`);
  process.exitCode = 1;
});
