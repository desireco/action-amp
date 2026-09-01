export function parseCapture(text: string): { url: string; tags: string[] } {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const tags = parts.filter((p) => p.startsWith("#")).map((p) => p.slice(1));
  const url = parts.find((p) => !p.startsWith("#")) ?? "";
  return { url, tags };
}

export function isValidUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
