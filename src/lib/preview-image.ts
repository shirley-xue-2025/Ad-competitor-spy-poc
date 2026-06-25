type ImageCandidate = { url: string; alt: string; index: number };

const ICON_PATTERN =
  /icon|logo|favicon|sprite|badge|arrow|chevron|star\.|svg|spacer|emoji|rating|trust-badge|payment|visa|mastercard|paypal|cookie|avatar|profile-pic|thumb-small|placeholder|co2class|seo\.svg/i;

const UI_CHOICE_PATTERN = /privat|gewerbe|wohnung|house-outline|building-icon|select.*option/i;

const THUMBNAIL_ONLY_PATTERN =
  /[?&](?:width|w|height|h)=(?:[1-9]|[1-9]\d|[12]\d{2}|300)(?:&|$)|_small\.|_530x|\/preview(?:\?|$)|rule=mo-1024|classistatic\.de\/api\/v1\/mo-prod/i;

const TRACKING_PIXEL_PATTERN =
  /fls-eu\.amazon|amazon\.[a-z.]+\/1\/oc-csi|\/oc-csi\/|doubleclick\.|google-analytics|facebook\.com\/tr\b|pixel\.|1x1\.|spacer\.gif/i;

function collectMarkdownImages(markdown: string): ImageCandidate[] {
  const results: ImageCandidate[] = [];
  const re = /!\[([^\]]*)]\((https?:\/\/[^)\s]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    results.push({ alt: match[1].trim(), url: match[2], index: results.length });
  }
  return results;
}

function scorePreviewImage(candidate: ImageCandidate): number {
  const { url, alt, index } = candidate;
  const blob = `${url} ${alt}`.toLowerCase();
  let score = Math.min(index, 5);

  if (/\.(png|jpe?g)(\?|$)/i.test(url)) {
    score += 10;
  } else if (/\.webp(\?|$)/i.test(url)) {
    score += 3;
  }

  if (alt.length > 2 && !/^(img|image|icon|logo|bild)$/i.test(alt)) {
    score += 20;
  }
  if (/mein bild/i.test(alt)) {
    score += 35;
  }

  if (/icon|logo|favicon|avatar|profile|headshot|portrait|screenshot/i.test(blob)) {
    score -= 45;
  }
  if (/funnelish\.com/i.test(url) && index === 0 && /\.jpe?g/i.test(url)) {
    score += 45;
  }
  if (/presell|hero|banner|article|landing|product|produkt|klima|angebot/i.test(blob)) {
    score += 18;
  }

  if (ICON_PATTERN.test(blob)) {
    score -= 50;
  }
  if (UI_CHOICE_PATTERN.test(blob)) {
    score -= 40;
  }

  if (/heyflow\.com.*\/original\.(png|jpe?g|webp)/i.test(url)) {
    score += 30;
  }

  // Hero images usually appear above the fold, before repeated funnel steps
  if (index <= 6 && alt.length > 2) {
    score += 12;
  }

  return score;
}

function rankPreviewCandidates(candidates: ImageCandidate[]): ImageCandidate[] {
  return [...candidates].sort((a, b) => {
    const diff = scorePreviewImage(b) - scorePreviewImage(a);
    if (diff !== 0) {
      return diff;
    }
    return a.index - b.index;
  });
}

/** Pick the best hero/product image from crawler markdown (skip icons & funnel tiles). */
export function extractPreviewImageFromMarkdown(markdown: string): string | null {
  if (!markdown?.trim()) {
    return null;
  }

  const candidates = collectMarkdownImages(markdown);
  if (candidates.length > 0) {
    const ranked = rankPreviewCandidates(candidates);
    const best = ranked.find((c) => scorePreviewImage(c) > -10);
    if (best) {
      return best.url;
    }
  }

  const htmlImage = markdown.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  if (htmlImage?.[1] && !ICON_PATTERN.test(htmlImage[1])) {
    return htmlImage[1];
  }

  const bareUrls = [...markdown.matchAll(
    /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?)/gi,
  )].map((m) => m[1]);

  for (let i = bareUrls.length - 1; i >= 0; i -= 1) {
    const url = bareUrls[i];
    if (!ICON_PATTERN.test(url) && !UI_CHOICE_PATTERN.test(url)) {
      return url;
    }
  }

  return null;
}

/** Client-side fallback when embedded preview is missing or looks like a UI icon. */
export function isLikelyUiIconUrl(url: string | null | undefined): boolean {
  if (!url) {
    return true;
  }
  const lower = url.toLowerCase();
  if (ICON_PATTERN.test(lower) || UI_CHOICE_PATTERN.test(lower)) {
    return true;
  }
  if (TRACKING_PIXEL_PATTERN.test(lower)) {
    return true;
  }
  if (/heyflow\.com/i.test(lower) && /\.webp/i.test(lower) && !/mein|hero|banner|product|original\.png/i.test(lower)) {
    return true;
  }
  return false;
}

/** Tiny crops / listing badges — fine for product thumb, not landing preview. */
export function isLikelyThumbnailOnly(url: string | null | undefined): boolean {
  if (!url) {
    return true;
  }
  return THUMBNAIL_ONLY_PATTERN.test(url.toLowerCase());
}

function markdownPreviewScore(markdown: string, url: string | null): number {
  if (!url) {
    return -100;
  }
  const candidates = collectMarkdownImages(markdown);
  const match = candidates.find((c) => c.url === url);
  return match ? scorePreviewImage(match) : -100;
}

/** Funnel / lead pages with rich inline heroes (Heyflow, Perspective, Funnelish, etc.). */
function shouldPreferMarkdownHero(pageUrl: string): boolean {
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    return /heyflow|klivatec|beratung-|anfrage\.|funnel|funnelish|lp\.|eliovence/i.test(host + pageUrl);
  } catch {
    return false;
  }
}

/** Full-page screenshot works better than a product crop. */
export function shouldPreferPageScreenshot(pageUrl: string | null | undefined): boolean {
  if (!pageUrl) {
    return false;
  }
  try {
    const parsed = new URL(pageUrl);
    const blob = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    return (
      /mobile\.de|mediamarkt\.|saturn\.|amazon\.|ebay\.|amzlink\.to/i.test(blob) ||
      /\/products?\//i.test(parsed.pathname) ||
      /\/search\.html/i.test(parsed.pathname) ||
      /onecdn\.io/i.test(pageUrl)
    );
  } catch {
    return false;
  }
}

export type LandingPreviewInput = {
  pageUrl: string;
  markdown: string;
  ogImageUrl?: string | null;
  productImageUrl?: string | null;
};

/**
 * Pick the best landing-page preview image.
 * Klivatec-style funnels → markdown hero; sparse pages → og:image; else mshots screenshot.
 */
export function pickLandingPreviewUrl(input: LandingPreviewInput): string | null {
  const { pageUrl, markdown, ogImageUrl, productImageUrl } = input;
  const mdCandidate = extractPreviewImageFromMarkdown(markdown);
  const mdScore = markdownPreviewScore(markdown, mdCandidate);

  if (
    mdCandidate &&
    !isLikelyUiIconUrl(mdCandidate) &&
    !isLikelyThumbnailOnly(mdCandidate) &&
    (mdScore >= 25 || (shouldPreferMarkdownHero(pageUrl) && mdScore >= 10))
  ) {
    return mdCandidate;
  }

  if (shouldPreferPageScreenshot(pageUrl)) {
    return landingPreviewFallbackUrl(pageUrl);
  }

  const ogCandidate = [ogImageUrl, productImageUrl].find(
    (url) => url && !isLikelyUiIconUrl(url) && !isLikelyThumbnailOnly(url),
  );
  if (ogCandidate) {
    return ogCandidate;
  }

  if (mdCandidate && !isLikelyUiIconUrl(mdCandidate) && !isLikelyThumbnailOnly(mdCandidate)) {
    return mdCandidate;
  }

  return landingPreviewFallbackUrl(pageUrl);
}

export function previewFromCrawlEntry(
  entry: { markdown: string; ogImageUrl?: string | null; productImageUrl?: string | null },
  pageUrl: string,
): string | null {
  return pickLandingPreviewUrl({
    pageUrl,
    markdown: entry.markdown,
    ogImageUrl: entry.ogImageUrl,
    productImageUrl: entry.productImageUrl,
  });
}

export function productImageFromCrawlEntry(
  entry: { markdown?: string; ogImageUrl?: string | null; productImageUrl?: string | null },
  pageUrl?: string,
): string | null {
  for (const url of [entry.productImageUrl, entry.ogImageUrl]) {
    if (url && !isLikelyUiIconUrl(url) && !isLikelyThumbnailOnly(url)) {
      return url;
    }
  }
  if (entry.markdown && pageUrl && shouldPreferMarkdownHero(pageUrl)) {
    return pickProductImageFromFunnelMarkdown(entry.markdown);
  }
  return null;
}

function pickProductImageFromFunnelMarkdown(markdown: string): string | null {
  const imgs = collectMarkdownImages(markdown);
  const productLike = imgs.find(
    (c) =>
      /\.webp/i.test(c.url) &&
      /cooling|product|fan|portable|kylace|aerovia|desktop/i.test(c.url.toLowerCase()),
  );
  if (productLike) {
    return productLike.url;
  }
  const midWebp = imgs.find((c) => c.index >= 2 && c.index <= 6 && /\.webp/i.test(c.url));
  return midWebp?.url ?? null;
}

/** When crawl has no og:product, fall back to LP hero or ad creative. */
export function productImageWithFallback(
  scrape: { previewImageUrl?: string | null; productImageUrl?: string | null },
  creativeUrl: string | null | undefined,
): string | null {
  if (scrape.productImageUrl) {
    return scrape.productImageUrl;
  }
  const preview = scrape.previewImageUrl;
  // Don't reuse LP hero / mshots as product thumb when they're the same slot
  if (
    preview &&
    !preview.includes('mshots') &&
    !isLikelyUiIconUrl(preview) &&
    !/screenshot/i.test(preview)
  ) {
    return preview;
  }
  if (creativeUrl && !isLikelyUiIconUrl(creativeUrl)) {
    return creativeUrl;
  }
  return null;
}

export function landingPreviewFallbackUrl(pageUrl: string | null | undefined): string | null {
  if (!pageUrl) {
    return null;
  }
  try {
    const encoded = encodeURIComponent(pageUrl);
    return `https://s.wordpress.com/mshots/v1/${encoded}?w=1200`;
  } catch {
    return null;
  }
}
