const JUNK_URL_PATTERNS = [
  /^https?:\/\/(www\.)?facebook\.com/i,
  /^https?:\/\/(www\.)?instagram\.com/i,
  /^https?:\/\/api\.whatsapp\.com/i,
  /^https?:\/\/(www\.)?whatsapp\.com/i,
  /^https?:\/\/(www\.)?m\.me\//i,
  /^https?:\/\/fb\.me\//i,
  /^https?:\/\/ad\.doubleclick\.net/i,
  /^https?:\/\/(www\.)?googleadservices\.com/i,
  /^https?:\/\/(www\.)?googlesyndication\.com/i,
];

const BLOCKED_CONTENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /just a moment/i, label: 'cloudflare challenge' },
  { pattern: /checking your browser/i, label: 'bot check' },
  { pattern: /access denied/i, label: 'access denied' },
  { pattern: /403 forbidden/i, label: '403' },
  { pattern: /captcha/i, label: 'captcha' },
  { pattern: /enable javascript/i, label: 'js required shell' },
  { pattern: /please enable cookies/i, label: 'cookie wall only' },
  { pattern: /datenschutz.*cookies.*akzeptieren/i, label: 'cookie-only page' },
];

export type ScrapeValidation = {
  valid: boolean;
  reason: string | null;
};

export function isSkippableLandingUrl(url: string | null | undefined): boolean {
  if (!url || url.trim().length === 0) {
    return true;
  }
  return JUNK_URL_PATTERNS.some((pattern) => pattern.test(url.trim()));
}

export function validateLandingMarkdown(
  markdown: string,
  minChars: number,
): ScrapeValidation {
  const trimmed = markdown.trim();

  if (trimmed.length < minChars) {
    return {
      valid: false,
      reason: `Markdown too short (${trimmed.length} chars, need >= ${minChars})`,
    };
  }

  for (const { pattern, label } of BLOCKED_CONTENT_PATTERNS) {
    if (pattern.test(trimmed) && trimmed.length < minChars * 2) {
      return { valid: false, reason: `Blocked/interstitial page detected (${label})` };
    }
  }

  const alphaCount = (trimmed.match(/[a-zA-ZäöüÄÖÜß]/g) ?? []).length;
  if (alphaCount < 200) {
    return {
      valid: false,
      reason: `Insufficient readable text (${alphaCount} letters)`,
    };
  }

  return { valid: true, reason: null };
}
