type ImageCandidate = { url: string; alt: string; index: number };

const ICON_PATTERN =
  /icon|logo|favicon|sprite|badge|arrow|chevron|star\.|svg|spacer|emoji|rating|trust-badge|payment|visa|mastercard|paypal|cookie|avatar|profile-pic|thumb-small|placeholder/i;

const UI_CHOICE_PATTERN = /privat|gewerbe|wohnung|house-outline|building-icon|select.*option/i;

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

  if (/mein bild|hero|banner|product|produkt|haupt|main|cover|feature|angebot|klima|showroom|beratung/i.test(blob)) {
    score += 25;
  }

  if (ICON_PATTERN.test(blob)) {
    score -= 50;
  }
  if (UI_CHOICE_PATTERN.test(blob)) {
    score -= 40;
  }

  if (/heyflow\.com/i.test(url) && !alt && /\.webp/i.test(url)) {
    score -= 35;
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
  if (/heyflow\.com/i.test(lower) && /\.webp/i.test(lower) && !/mein|hero|banner|product/i.test(lower)) {
    return true;
  }
  return false;
}

export function landingPreviewFallbackUrl(pageUrl: string | null | undefined): string | null {
  if (!pageUrl) {
    return null;
  }
  try {
    const encoded = encodeURIComponent(pageUrl);
    return `https://s.wordpress.com/mshots/v1/${encoded}?w=800`;
  } catch {
    return null;
  }
}
