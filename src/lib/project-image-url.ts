const SAHA_GORSEL_HOST = "saha-gorsel-paneli.oner334480.workers.dev";

export function getDisplayImageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.hostname === SAHA_GORSEL_HOST &&
      /^\/p\/[a-f0-9]+\/?$/i.test(url.pathname)
    ) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/dosya`;
      return url.toString();
    }
  } catch {
    return value;
  }

  return value;
}
