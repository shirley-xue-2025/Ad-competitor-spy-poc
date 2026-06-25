import 'dotenv/config';

import { ApifyClient } from 'apify-client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ACTOR_ID, COUNTRY_CODE, KEYWORDS, MAX_ITEMS, OUTPUT_DIR } from './config.js';
import { normalizeAds, type RawAdRecord } from './lib/normalize-ad.js';

const DATASET_ID = process.argv[2] ?? 'rtSIk6XDdCiO69Rch';
const RUN_ID = process.argv[3] ?? 's7vpnJcXJBNoVIt2W';

function timestampForFilename(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('Missing APIFY_TOKEN in .env');
  }

  const client = new ApifyClient({ token });
  const { items } = await client.dataset(DATASET_ID).listItems();
  const ads = normalizeAds(items as RawAdRecord[]).slice(0, MAX_ITEMS);

  const landingPageUrls = [
    ...new Set(
      ads
        .map((ad) => ad.landingPageUrl)
        .filter((url): url is string => typeof url === 'string' && url.length > 0),
    ),
  ];

  const output = {
    meta: {
      scrapedAt: new Date().toISOString(),
      actorId: ACTOR_ID,
      country: COUNTRY_CODE,
      keywords: [...KEYWORDS],
      maxItems: MAX_ITEMS,
      runId: RUN_ID,
      datasetId: DATASET_ID,
      actorRunUrl: `https://console.apify.com/actors/runs/${RUN_ID}`,
      reprocessed: true,
    },
    ads,
    landingPageUrls,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `ads-reprocessed-${timestampForFilename()}.json`);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  const withLanding = ads.filter((ad) => ad.landingPageUrl).length;
  const withCreative = ads.filter((ad) => ad.creativeUrl).length;
  const withBody = ads.filter((ad) => ad.adBody).length;

  console.log(`Reprocessed ${ads.length} ads -> ${outputPath}`);
  console.log(`Fields filled: body=${withBody}, creative=${withCreative}, landing=${withLanding}`);
  console.log(`Unique landing pages: ${landingPageUrls.length}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Reprocess failed: ${message}`);
  process.exitCode = 1;
});
