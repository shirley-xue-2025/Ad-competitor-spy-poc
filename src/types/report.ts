import type { AdsInputRecord } from './ads-input.js';

export type LlmAnalysis = {
  marketing_hook: string;
  form_questions: string[];
  localized_translation: string;
};

export type ScrapeMeta = {
  crawlRunId: string | null;
  pageTitle: string | null;
  markdownLength: number;
  loadedUrl: string | null;
  previewImageUrl: string | null;
};

export type ReportItem = {
  status: 'success' | 'failed';
  error: string | null;
  ad: AdsInputRecord;
  scrape: ScrapeMeta | null;
  analysis: LlmAnalysis | null;
};

export type FinalReport = {
  meta: {
    generatedAt: string;
    sourceFile: string;
    targetSuccessCount: number;
    candidatesAttempted: number;
    successCount: number;
    failedCount: number;
    websiteCrawlerActor: string;
    llmModel: string;
    vertical?: string;
    verticalLabel?: string;
  };
  /** Only successful, validated analyses (up to targetSuccessCount). */
  items: ReportItem[];
  /** Failed/skipped attempts for debugging (not counted in items). */
  skipped: ReportItem[];
};
