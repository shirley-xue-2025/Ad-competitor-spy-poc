export type AdLibrarySearchParams = {
  keyword: string;
  countryCode?: string;
  activeStatus?: 'active' | 'inactive' | 'all';
  mediaType?: 'all' | 'image' | 'video' | 'meme';
};

const AD_LIBRARY_BASE = 'https://www.facebook.com/ads/library/';

/**
 * Build a Meta Ad Library keyword-search URL.
 * Filters are encoded in the URL so the actor scrapes exactly what we see in the UI.
 */
export function buildAdLibraryKeywordUrl({
  keyword,
  countryCode = 'DE',
  activeStatus = 'active',
  mediaType = 'all',
}: AdLibrarySearchParams): string {
  const params = new URLSearchParams({
    active_status: activeStatus,
    ad_type: 'all',
    country: countryCode,
    q: keyword,
    search_type: 'keyword_unordered',
    media_type: mediaType,
  });

  return `${AD_LIBRARY_BASE}?${params.toString()}`;
}

export function buildKeywordUrls(
  keywords: readonly string[],
  countryCode = 'DE',
): string[] {
  return keywords.map((keyword) =>
    buildAdLibraryKeywordUrl({ keyword, countryCode, activeStatus: 'active' }),
  );
}
