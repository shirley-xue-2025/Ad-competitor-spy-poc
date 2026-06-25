import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEEP_ANALYZE_MAX_CANDIDATES,
  OUTPUT_DIR,
} from '../config.js';
import type { AdsInputFile, AdsInputRecord } from '../types/ads-input.js';
import { isSkippableLandingUrl } from './validate-scrape.js';

export async function resolveAdsInputPath(explicitPath?: string): Promise<string> {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }

  const files = await readdir(OUTPUT_DIR);
  const candidates = files
    .filter((name) => name.startsWith('ads-') && name.endsWith('.json') && !name.includes('reprocessed'))
    .sort()
    .reverse();

  if (candidates.length === 0) {
    throw new Error(`No ads JSON found in ${OUTPUT_DIR}. Run npm run scrape first.`);
  }

  return path.join(OUTPUT_DIR, candidates[0]!);
}

export async function loadAdsInput(filePath: string): Promise<AdsInputFile> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as AdsInputFile;
}

function normalizeUrlForDedup(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

/** Pick deduped ad candidates with real landing URLs, up to maxCandidates. */
export function pickAdsForDeepAnalysis(
  ads: AdsInputRecord[],
  maxCandidates: number = DEEP_ANALYZE_MAX_CANDIDATES,
): AdsInputRecord[] {
  const seen = new Set<string>();
  const picked: AdsInputRecord[] = [];

  for (const ad of ads) {
    const url = ad.landingPageUrl?.trim();
    if (!url || isSkippableLandingUrl(url)) {
      continue;
    }

    const key = normalizeUrlForDedup(url);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    picked.push(ad);

    if (picked.length >= maxCandidates) {
      break;
    }
  }

  return picked;
}
