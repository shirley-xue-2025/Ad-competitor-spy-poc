import { GoogleGenerativeAI } from '@google/generative-ai';

import type { LlmAnalysis } from '../types/report.js';

import { LLM_DOMAIN } from '../config.js';

const LEADGEN_PROMPT = `You are a senior performance marketing analyst specializing in European affiliate leadgen funnels (Germany: Solar, heat pumps, home insurance).

You will receive:
1) A Facebook/Meta ad body (German)
2) The landing page content as Markdown (German, from a single-page scrape)

Your job is to reverse-engineer the competitor's REAL marketing angle and lead form structure.

CRITICAL — IGNORE NOISE (do NOT analyze or quote these):
- Cookie consent banners, GDPR popups, "Akzeptieren/Accept all" text
- Bot checks, Cloudflare "Just a moment", captcha, 403/access denied pages
- Navigation menus, footers, legal imprint (Impressum), privacy policy boilerplate
- Scrape errors, empty shells, placeholder lorem ipsum
- If the landing markdown looks like an error/interstitial page, say so in marketing_hook and return form_questions: []

If landing content is thin but the ad body is strong, base marketing_hook and localized_translation primarily on the ad — but do NOT invent brands, offers, or form fields not present in the inputs.

Rules:
- Output ONLY valid JSON. No markdown fences, no commentary.
- marketing_hook: ONE sentence in Chinese explaining the core pain point or desire the ad exploits (fear, subsidy greed, urgency, regulation, savings, etc.). Be specific to this competitor.
- form_questions: Array of strings listing lead form questions in order (step 1, 2, 3...). Only include fields visible in the landing markdown. If no form, return [].
- localized_translation: Chinese translation of the most persuasive REAL marketing copy from ad + landing hero. Keep emotional punch. Do not invent Enpal/other brands unless they appear in the inputs.

JSON schema:
{
  "marketing_hook": "string",
  "form_questions": ["string"],
  "localized_translation": "string"
}`;

const ECOMMERCE_PROMPT = `You are a senior performance marketing analyst specializing in German e-commerce and DTC paid social (air conditioners, portable AC, cooling devices).

You will receive:
1) A Facebook/Meta ad body (German)
2) The landing page content as Markdown (German, from a single-page scrape)

Your job is to reverse-engineer what PRODUCT is being sold, the price/offer angle, and the conversion hook.

CRITICAL — IGNORE NOISE (do NOT analyze or quote these):
- Cookie consent banners, GDPR popups, bot checks, Cloudflare, 403 pages
- Navigation menus, footers, legal boilerplate
- If landing markdown looks like an error page, say so in marketing_hook and return form_questions: []

Rules:
- Output ONLY valid JSON. No markdown fences, no commentary.
- marketing_hook: ONE sentence in Chinese naming the product type/brand (if visible), core pain (heatwave, sleep, office), and offer angle (discount, portable, install-free, BTU spec). Be specific.
- form_questions: Checkout or quiz steps visible on the landing page, in order. If direct product page with "In den Warenkorb" only, return [].
- localized_translation: Chinese translation of the most persuasive REAL copy from ad + landing hero. Keep product specifics (model, price, BTU, promo).

JSON schema:
{
  "marketing_hook": "string",
  "form_questions": ["string"],
  "localized_translation": "string"
}`;

function getSystemPrompt(): string {
  return LLM_DOMAIN === 'ecommerce' ? ECOMMERCE_PROMPT : LEADGEN_PROMPT;
}

const MAX_MARKDOWN_CHARS = 14_000;

function truncateForLlm(markdown: string): string {
  if (markdown.length <= MAX_MARKDOWN_CHARS) {
    return markdown;
  }
  return `${markdown.slice(0, MAX_MARKDOWN_CHARS)}\n\n...[truncated for token limit]`;
}

function parseLlmJson(text: string): LlmAnalysis {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  const parsed = JSON.parse(cleaned) as Partial<LlmAnalysis>;

  if (!parsed.marketing_hook || typeof parsed.marketing_hook !== 'string') {
    throw new Error('LLM response missing marketing_hook');
  }
  if (!Array.isArray(parsed.form_questions)) {
    throw new Error('LLM response missing form_questions array');
  }
  if (!parsed.localized_translation || typeof parsed.localized_translation !== 'string') {
    throw new Error('LLM response missing localized_translation');
  }

  return {
    marketing_hook: parsed.marketing_hook.trim(),
    form_questions: parsed.form_questions.map((q) => String(q).trim()).filter(Boolean),
    localized_translation: parsed.localized_translation.trim(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type LlmProvider = 'gemini' | 'openrouter';

export function getLlmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (provider === 'openrouter') {
    return 'openrouter';
  }
  return 'gemini';
}

export function requireGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Missing GEMINI_API_KEY. Add it to your .env file.');
  }
  return key;
}

export function requireOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('Missing OPENROUTER_API_KEY. Add it to your .env file.');
  }
  return key;
}

export function getGeminiModelName(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  // Free tier often has no quota on gemini-2.0-flash; prefer 2.5-flash.
  if (model && model !== 'gemini-2.0-flash') {
    return model;
  }
  return 'gemini-2.5-flash';
}

export function getOpenRouterModelName(): string {
  return process.env.OPENROUTER_MODEL?.trim() || 'google/gemini-2.5-flash';
}

export function getLlmModelName(): string {
  return getLlmProvider() === 'openrouter' ? getOpenRouterModelName() : getGeminiModelName();
}

function buildUserPrompt(adBody: string, landingMarkdown: string): string {
  return `## Ad body (German)
${adBody || '(empty)'}

## Landing page (Markdown, German)
${truncateForLlm(landingMarkdown)}`;
}

async function analyzeWithOpenRouter(
  adBody: string,
  landingMarkdown: string,
): Promise<LlmAnalysis> {
  const apiKey = requireOpenRouterApiKey();
  const model = getOpenRouterModelName();
  const userPrompt = buildUserPrompt(adBody, landingMarkdown);

  const maxAttempts = 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/affiliate-ad-spy',
          'X-Title': 'affiliate-ad-spy',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: getSystemPrompt() },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.25,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenRouter HTTP ${response.status}: ${body.slice(0, 500)}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('OpenRouter returned an empty response.');
      }
      return parseLlmJson(text);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = message.includes('429') || message.toLowerCase().includes('rate limit');
      if (isRateLimit && attempt < maxAttempts) {
        const waitSec = 15 * attempt;
        console.warn(`  !! OpenRouter rate limit, retry in ${waitSec}s (attempt ${attempt}/${maxAttempts})`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function analyzeWithLlm(
  adBody: string,
  landingMarkdown: string,
): Promise<LlmAnalysis> {
  if (getLlmProvider() === 'openrouter') {
    return analyzeWithOpenRouter(adBody, landingMarkdown);
  }
  return analyzeWithGemini(adBody, landingMarkdown);
}

export async function analyzeWithGemini(
  adBody: string,
  landingMarkdown: string,
): Promise<LlmAnalysis> {
  const genAI = new GoogleGenerativeAI(requireGeminiApiKey());
  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      temperature: 0.25,
      responseMimeType: 'application/json',
    },
    systemInstruction: getSystemPrompt(),
  });

  const userPrompt = buildUserPrompt(adBody, landingMarkdown);

  const maxAttempts = 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await model.generateContent(userPrompt);
      const text = result.response.text();
      if (!text) {
        throw new Error('Gemini returned an empty response.');
      }
      return parseLlmJson(text);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = message.includes('429') || message.includes('quota');
      if (isRateLimit && attempt < maxAttempts) {
        const waitSec = 15 * attempt;
        console.warn(`  !! Gemini rate limit, retry in ${waitSec}s (attempt ${attempt}/${maxAttempts})`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
