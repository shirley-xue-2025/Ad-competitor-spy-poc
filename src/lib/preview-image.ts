/** Pull the first usable product/hero image URL from crawler markdown. */
export function extractPreviewImageFromMarkdown(markdown: string): string | null {
  if (!markdown?.trim()) {
    return null;
  }

  const markdownImage = markdown.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)/i);
  if (markdownImage?.[1]) {
    return markdownImage[1];
  }

  const htmlImage = markdown.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  if (htmlImage?.[1]) {
    return htmlImage[1];
  }

  const bareUrl = markdown.match(
    /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/i,
  );
  return bareUrl?.[1] ?? null;
}
