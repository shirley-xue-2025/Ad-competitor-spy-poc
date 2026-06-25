type SnapshotBody =
  | string
  | {
      text?: string | null;
    }
  | null
  | undefined;

type SnapshotCard = {
  body?: string | null;
  title?: string | null;
  linkUrl?: string | null;
  link_url?: string | null;
  originalImageUrl?: string | null;
  original_image_url?: string | null;
  resizedImageUrl?: string | null;
  resized_image_url?: string | null;
  videoPreviewImageUrl?: string | null;
  video_preview_image_url?: string | null;
  videoHdUrl?: string | null;
  video_hd_url?: string | null;
  videoSdUrl?: string | null;
  video_sd_url?: string | null;
};

type Snapshot = {
  body?: SnapshotBody;
  title?: string | null;
  linkUrl?: string | null;
  link_url?: string | null;
  images?: Array<string | { originalImageUrl?: string; resizedImageUrl?: string; original_image_url?: string; resized_image_url?: string }>;
  videos?: Array<{
    videoPreviewImageUrl?: string | null;
    video_preview_image_url?: string | null;
    videoHdUrl?: string | null;
    video_hd_url?: string | null;
    videoSdUrl?: string | null;
    video_sd_url?: string | null;
  }>;
  cards?: SnapshotCard[];
};

export type RawAdRecord = {
  adArchiveId?: string;
  ad_archive_id?: string;
  linkUrl?: string | null;
  link_url?: string | null;
  adDescription?: string | null;
  snapshot?: Snapshot;
  inputUrl?: string;
  url?: string;
  runTag?: string;
  pageName?: string;
  page_name?: string;
  isActive?: boolean;
  is_active?: boolean;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  adDeliveryStartTime?: string;
  ad_delivery_start_time?: string;
  adDeliveryStopTime?: string;
  ad_delivery_stop_time?: string;
  spend?: string | { lower_bound?: string; upper_bound?: string; currency?: string };
  impressions?: string | { lower_bound?: string; upper_bound?: string };
  reachEstimate?: string | { lower_bound?: string; upper_bound?: string };
  reach_estimate?: string | { lower_bound?: string; upper_bound?: string };
  euTotalReach?: string | number;
  eu_total_reach?: string | number;
};

export type CleanAd = {
  adBody: string | null;
  creativeUrl: string | null;
  landingPageUrl: string | null;
  adArchiveId: string | null;
  sourceKeyword: string | null;
  adLibraryUrl: string | null;
  pageName: string | null;
  adDeliveryStart: string | null;
  adDeliveryStop: string | null;
  isActive: boolean | null;
  spendText: string | null;
  impressionsText: string | null;
  reachText: string | null;
};

const TEMPLATE_PLACEHOLDER = /^\{\{[^}]+\}\}$/;

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isUsableText(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && !TEMPLATE_PLACEHOLDER.test(trimmed);
}

function readBodyText(body: SnapshotBody): string | null {
  if (typeof body === 'string') {
    return isUsableText(body) ? body.trim() : null;
  }
  if (body && typeof body === 'object' && typeof body.text === 'string') {
    return isUsableText(body.text) ? body.text.trim() : null;
  }
  return null;
}

function readImageUrl(
  image: string | { originalImageUrl?: string; resizedImageUrl?: string; original_image_url?: string; resized_image_url?: string },
): string | null {
  if (typeof image === 'string') {
    return image;
  }
  return firstNonEmpty(
    image.originalImageUrl,
    image.original_image_url,
    image.resizedImageUrl,
    image.resized_image_url,
  );
}

function extractCreativeUrl(snapshot?: Snapshot): string | null {
  if (!snapshot) {
    return null;
  }

  for (const card of snapshot.cards ?? []) {
    const imageFromCard = firstNonEmpty(
      card.originalImageUrl,
      card.original_image_url,
      card.resizedImageUrl,
      card.resized_image_url,
      card.videoPreviewImageUrl,
      card.video_preview_image_url,
      card.videoHdUrl,
      card.video_hd_url,
      card.videoSdUrl,
      card.video_sd_url,
    );
    if (imageFromCard) {
      return imageFromCard;
    }
  }

  const imageFromList = snapshot.images?.[0];
  if (imageFromList) {
    return readImageUrl(imageFromList);
  }

  const video = snapshot.videos?.[0];
  return firstNonEmpty(
    video?.videoPreviewImageUrl ?? undefined,
    video?.video_preview_image_url ?? undefined,
    video?.videoHdUrl ?? undefined,
    video?.video_hd_url ?? undefined,
    video?.videoSdUrl ?? undefined,
    video?.video_sd_url ?? undefined,
  );
}

function extractAdBody(snapshot?: Snapshot, fallback?: string | null): string | null {
  const cardTexts =
    snapshot?.cards
      ?.flatMap((card) => [card.body, card.title])
      .filter(isUsableText) ?? [];

  const snapshotBody = readBodyText(snapshot?.body);
  const snapshotTitle = isUsableText(snapshot?.title) ? snapshot.title!.trim() : null;

  return firstNonEmpty(
    ...cardTexts,
    fallback ?? undefined,
    snapshotBody ?? undefined,
    snapshotTitle ?? undefined,
  );
}

function extractUrlFromText(text: string | null): string | null {
  if (!text) {
    return null;
  }
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

function extractLandingPageUrl(
  record: RawAdRecord,
  snapshot?: Snapshot,
): string | null {
  const cardLinks =
    snapshot?.cards
      ?.map((card) => firstNonEmpty(card.linkUrl, card.link_url))
      .filter((value): value is string => Boolean(value)) ?? [];

  const fromSnapshot = firstNonEmpty(
    snapshot?.linkUrl,
    snapshot?.link_url,
    ...cardLinks,
    record.linkUrl ?? undefined,
    record.link_url ?? undefined,
  );

  if (fromSnapshot && !TEMPLATE_PLACEHOLDER.test(fromSnapshot)) {
    return fromSnapshot;
  }

  const bodyText = extractAdBody(snapshot, record.adDescription);
  return extractUrlFromText(bodyText);
}

function inferKeywordFromInputUrl(inputUrl?: string): string | null {
  if (!inputUrl) {
    return null;
  }

  try {
    const url = new URL(inputUrl);
    return url.searchParams.get('q');
  } catch {
    return null;
  }
}

function formatRange(
  value: string | { lower_bound?: string; upper_bound?: string; currency?: string } | undefined,
  suffix = '',
): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'object') {
    const lower = value.lower_bound?.trim();
    const upper = value.upper_bound?.trim();
    const currency = 'currency' in value ? value.currency?.trim() : '';
    if (lower && upper && lower !== upper) {
      return `${currency ? `${currency} ` : ''}${lower} – ${upper}${suffix}`;
    }
    if (upper) {
      return `${currency ? `${currency} ` : ''}${upper}${suffix}`;
    }
    if (lower) {
      return `${currency ? `${currency} ` : ''}${lower}${suffix}`;
    }
  }
  return null;
}

function buildAdLibraryUrl(adArchiveId: string | null): string | null {
  if (!adArchiveId) {
    return null;
  }
  return `https://www.facebook.com/ads/library/?id=${adArchiveId}`;
}

function extractDeliveryMeta(record: RawAdRecord, adArchiveId: string | null) {
  const reach = record.euTotalReach ?? record.eu_total_reach;
  const reachEstimate = record.reachEstimate ?? record.reach_estimate;

  return {
    adLibraryUrl: buildAdLibraryUrl(adArchiveId),
    pageName: firstNonEmpty(record.pageName, record.page_name),
    adDeliveryStart: firstNonEmpty(
      record.adDeliveryStartTime,
      record.ad_delivery_start_time,
      record.startDate,
      record.start_date,
    ),
    adDeliveryStop: firstNonEmpty(
      record.adDeliveryStopTime,
      record.ad_delivery_stop_time,
      record.endDate,
      record.end_date,
    ),
    isActive:
      typeof record.isActive === 'boolean'
        ? record.isActive
        : typeof record.is_active === 'boolean'
          ? record.is_active
          : null,
    spendText: formatRange(record.spend),
    impressionsText: formatRange(record.impressions, ' impressions'),
    reachText:
      reach != null && String(reach).trim()
        ? String(reach).trim()
        : formatRange(reachEstimate, ' reach'),
  };
}

/**
 * Normalize heterogeneous actor payloads into the 3 fields needed downstream.
 * Handles curious_coder (snake_case) and apify/facebook-ads-scraper (camelCase).
 */
export function normalizeAd(record: RawAdRecord): CleanAd {
  const snapshot = record.snapshot;
  const adArchiveId = firstNonEmpty(record.adArchiveId, record.ad_archive_id);

  return {
    adBody: extractAdBody(snapshot, record.adDescription),
    creativeUrl: extractCreativeUrl(snapshot),
    landingPageUrl: extractLandingPageUrl(record, snapshot),
    adArchiveId,
    sourceKeyword: inferKeywordFromInputUrl(record.inputUrl ?? record.url),
    ...extractDeliveryMeta(record, adArchiveId),
  };
}

export function normalizeAds(records: RawAdRecord[]): CleanAd[] {
  return records.map(normalizeAd);
}
