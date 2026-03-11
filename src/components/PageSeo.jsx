import { useEffect } from "react";
import { getCachedPublicSettings, SITE_BRANDING_UPDATED_EVENT } from "@/lib/site-settings";
import {
  buildDocumentTitle,
  DEFAULT_SITE_DESCRIPTION,
  normalizeSiteTitle,
  resolveUrl,
} from "@/lib/seo";

const STRUCTURED_DATA_ID = "page-seo-structured-data";

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const upsertMeta = (attribute, key, content) => {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
};

const removeMeta = (attribute, key) => {
  document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
};

const upsertLink = (rel, href) => {
  let element = document.head.querySelector(`link[rel="${rel}"]`);

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
};

const syncStructuredData = (payload) => {
  const existing = document.getElementById(STRUCTURED_DATA_ID);

  if (!payload) {
    existing?.remove();
    return;
  }

  const script = existing || document.createElement("script");
  script.id = STRUCTURED_DATA_ID;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(payload);

  if (!existing) {
    document.head.appendChild(script);
  }
};

const normalizeKeywords = (keywords) => {
  if (Array.isArray(keywords)) {
    return keywords.filter(Boolean).join(", ");
  }

  return normalizeText(keywords);
};

export default function PageSeo({
  title,
  description = DEFAULT_SITE_DESCRIPTION,
  image,
  type = "website",
  robots = "index,follow",
  keywords,
  canonicalPath,
  structuredData,
}) {
  useEffect(() => {
    const applySeo = (settings = getCachedPublicSettings()) => {
      const siteTitle = normalizeSiteTitle(settings?.site_title);
      const pageTitle = normalizeText(title);
      const fullTitle = buildDocumentTitle(pageTitle, siteTitle);
      const normalizedDescription = normalizeText(description) || DEFAULT_SITE_DESCRIPTION;
      const normalizedKeywords = normalizeKeywords(keywords);
      const canonicalUrl = resolveUrl(canonicalPath || window.location.pathname || "/");
      const imageUrl = resolveUrl(normalizeText(image) || settings?.site_favicon_url?.trim() || "/favicon.ico");
      const normalizedStructuredData =
        typeof structuredData === "function"
          ? structuredData({
              canonicalUrl,
              imageUrl,
              siteTitle,
              title: fullTitle,
            })
          : structuredData;

      document.documentElement.dataset.pageTitle = pageTitle;
      document.documentElement.dataset.siteTitle = siteTitle;
      document.title = fullTitle;

      upsertMeta("name", "description", normalizedDescription);
      upsertMeta("name", "robots", robots);
      upsertMeta("name", "application-name", siteTitle);
      upsertMeta("name", "apple-mobile-web-app-title", siteTitle);
      upsertMeta("property", "og:type", type);
      upsertMeta("property", "og:site_name", siteTitle);
      upsertMeta("property", "og:title", fullTitle);
      upsertMeta("property", "og:description", normalizedDescription);
      upsertMeta("property", "og:url", canonicalUrl);
      upsertMeta("property", "og:locale", "ru_RU");
      upsertMeta("property", "og:image", imageUrl);
      upsertMeta("name", "twitter:card", imageUrl.endsWith(".ico") ? "summary" : "summary_large_image");
      upsertMeta("name", "twitter:title", fullTitle);
      upsertMeta("name", "twitter:description", normalizedDescription);
      upsertMeta("name", "twitter:image", imageUrl);
      upsertLink("canonical", canonicalUrl);

      if (normalizedKeywords) {
        upsertMeta("name", "keywords", normalizedKeywords);
      } else {
        removeMeta("name", "keywords");
      }

      syncStructuredData(normalizedStructuredData);
    };

    const handleBrandingUpdate = (event) => {
      applySeo(event?.detail || getCachedPublicSettings());
    };

    applySeo();
    window.addEventListener(SITE_BRANDING_UPDATED_EVENT, handleBrandingUpdate);

    return () => {
      window.removeEventListener(SITE_BRANDING_UPDATED_EVENT, handleBrandingUpdate);
      delete document.documentElement.dataset.pageTitle;
      syncStructuredData(null);
    };
  }, [canonicalPath, description, image, keywords, robots, structuredData, title, type]);

  return null;
}
