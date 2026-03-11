import { useEffect } from "react";
import {
  fetchPublicSettings,
  getCachedPublicSettings,
  SITE_BRANDING_UPDATED_EVENT,
} from "@/lib/site-settings";

const DEFAULT_TITLE = "VibeFlow";

const ensureFaviconElement = () => {
  const existing = document.querySelector('link[rel="icon"]');
  if (existing) return existing;

  const link = document.createElement("link");
  link.setAttribute("rel", "icon");
  document.head.appendChild(link);
  return link;
};

const applyBranding = (settings, defaultFaviconUrl) => {
  const nextTitle = settings?.site_title?.trim() || DEFAULT_TITLE;
  document.title = nextTitle;

  const faviconLink = ensureFaviconElement();
  const faviconUrl = settings?.site_favicon_url?.trim();
  faviconLink.setAttribute("href", faviconUrl || defaultFaviconUrl || "/favicon.ico");
};

export default function SiteBranding() {
  useEffect(() => {
    const defaultFaviconUrl = ensureFaviconElement().getAttribute("href") || "/favicon.ico";

    applyBranding(getCachedPublicSettings(), defaultFaviconUrl);

    let mounted = true;
    const sync = async () => {
      const settings = await fetchPublicSettings();
      if (!mounted) return;
      applyBranding(settings, defaultFaviconUrl);
    };

    const handleBrandingUpdate = (event) => {
      applyBranding(event?.detail || getCachedPublicSettings(), defaultFaviconUrl);
    };

    window.addEventListener(SITE_BRANDING_UPDATED_EVENT, handleBrandingUpdate);
    sync();

    return () => {
      mounted = false;
      window.removeEventListener(SITE_BRANDING_UPDATED_EVENT, handleBrandingUpdate);
    };
  }, []);

  return null;
}
