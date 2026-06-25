import { getVertical } from './verticals.js';

const vertical = getVertical();

/** Actor choice: curious_coder is cheaper and keyword-search native for prototype runs. */
export const ACTOR_ID = 'curious_coder/facebook-ads-library-scraper' as const;

export const COUNTRY_CODE = 'DE' as const;

export const VERTICAL_ID = vertical.id;
export const VERTICAL_LABEL = vertical.label;

export const KEYWORDS = vertical.keywords;
export const OUTPUT_DIR = vertical.outputDir;
export const MAX_ITEMS = vertical.maxItems;
export const AD_LIBRARY_SORT_BY = vertical.adLibrarySortBy;
export const SCRAPE_AD_DETAILS = vertical.scrapeAdDetails;
export const LLM_DOMAIN = vertical.llmDomain;

/** Per-keyword URL cap when multiple keywords are searched. */
export const LIMIT_PER_SOURCE = Math.ceil(MAX_ITEMS / KEYWORDS.length);

/** Target number of valid landing-page analyses in final_report.json. */
export const DEEP_ANALYZE_TARGET_SUCCESS = vertical.deepAnalyzeTargetSuccess;

/** Max ad candidates to attempt before giving up (deduped by landing URL). */
export const DEEP_ANALYZE_MAX_CANDIDATES = vertical.deepAnalyzeMaxCandidates;

/** Minimum markdown length to count as a real landing page (not cookie wall / error). */
export const MIN_LANDING_MARKDOWN_CHARS = vertical.minLandingMarkdownChars;

/** Set USE_RESIDENTIAL_PROXY=true in .env for geo-sensitive runs (higher cost). */
export const USE_RESIDENTIAL_PROXY =
  process.env.USE_RESIDENTIAL_PROXY?.toLowerCase() === 'true';
