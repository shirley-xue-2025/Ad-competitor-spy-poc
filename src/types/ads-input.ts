export type AdsInputMeta = {
  scrapedAt: string;
  actorId: string;
  country: string;
  keywords: string[];
  maxItems: number;
  runId: string;
  datasetId: string;
  actorRunUrl: string;
  vertical?: string;
  reprocessed?: boolean;
};

export type AdDeliveryMeta = {
  adLibraryUrl: string | null;
  pageName: string | null;
  adDeliveryStart: string | null;
  adDeliveryStop: string | null;
  isActive: boolean | null;
  spendText: string | null;
  impressionsText: string | null;
  reachText: string | null;
};

export type AdsInputRecord = {
  adBody: string | null;
  creativeUrl: string | null;
  landingPageUrl: string | null;
  adArchiveId: string | null;
  sourceKeyword: string | null;
} & AdDeliveryMeta;

export type AdsInputFile = {
  meta: AdsInputMeta;
  ads: AdsInputRecord[];
  landingPageUrls: string[];
};
