export type VerticalId = 'leadgen' | 'ac';

export type VerticalConfig = {
  id: VerticalId;
  label: string;
  keywords: readonly string[];
  outputDir: string;
  maxItems: number;
  deepAnalyzeTargetSuccess: number;
  deepAnalyzeMaxCandidates: number;
  minLandingMarkdownChars: number;
  /** Meta Ad Library sort — most_recent surfaces current heatwave creatives. */
  adLibrarySortBy: 'most_recent' | 'impressions_desc';
  scrapeAdDetails: boolean;
  llmDomain: 'leadgen' | 'ecommerce';
};

export const VERTICALS: Record<VerticalId, VerticalConfig> = {
  leadgen: {
    id: 'leadgen',
    label: 'DE Leadgen (Solar / Wärmepumpe / Versicherung)',
    keywords: [
      'Solaranlage',
      'Wärmepumpe',
      'Hausratversicherung',
      'Wohngebäudeversicherung',
    ],
    outputDir: 'output',
    maxItems: 60,
    deepAnalyzeTargetSuccess: 10,
    deepAnalyzeMaxCandidates: 45,
    minLandingMarkdownChars: 800,
    adLibrarySortBy: 'most_recent',
    scrapeAdDetails: false,
    llmDomain: 'leadgen',
  },
  ac: {
    id: 'ac',
    label: 'DE AC / Heatwave (Klimaanlage)',
    keywords: [
      'Klimaanlage',
      'Mobile Klimaanlage',
      'Split Klimaanlage',
      'Klimagerät',
      'Luftkühler',
    ],
    outputDir: 'output-ac',
    maxItems: 80,
    deepAnalyzeTargetSuccess: 12,
    deepAnalyzeMaxCandidates: 50,
    minLandingMarkdownChars: 400,
    adLibrarySortBy: 'most_recent',
    scrapeAdDetails: true,
    llmDomain: 'ecommerce',
  },
};

export function resolveVerticalId(): VerticalId {
  const raw = process.env.VERTICAL?.trim().toLowerCase();
  if (raw === 'ac') {
    return 'ac';
  }
  return 'leadgen';
}

export function getVertical(): VerticalConfig {
  return VERTICALS[resolveVerticalId()];
}
