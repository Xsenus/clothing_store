import { useEffect } from "react";
import { fetchPublicSettings, getCachedPublicSettings } from "@/lib/site-settings";

const DEFAULT_TITLE = "VibeFlow";

const ensureFaviconElement = () => {
  const existing = document.querySelector('link[rel="icon"]');
  if (existing) return existing;

  const link = document.createElement("link");
  link.setAttribute("rel", "icon");
  document.head.appendChild(link);
  return link;
};

const applyBranding = (settings) => {
  const nextTitle = settings?.site_title?.trim() || DEFAULT_TITLE;
  document.title = nextTitle;

  const faviconUrl = settings?.site_favicon_url?.trim();
  if (!faviconUrl) return;

  const faviconLink = ensureFaviconElement();
  faviconLink.setAttribute("href", faviconUrl);
};

export default function SiteBranding() {
  useEffect(() => {
    applyBranding(getCachedPublicSettings());

    let mounted = true;
    const sync = async () => {
      const settings = await fetchPublicSettings();
      if (!mounted) return;
      applyBranding(settings);
    };

    sync();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
