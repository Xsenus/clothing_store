import { useEffect, useMemo, useState } from "react";

import {
  fetchPublicSettings,
  getCachedPublicSettings,
  SITE_BRANDING_UPDATED_EVENT,
} from "@/lib/site-settings";
import {
  getSiteSocialLinksForPlacement,
  parseSiteSocialLinksConfig,
} from "@/lib/social-links";

type PublicSettings = Record<string, string>;

export default function useSiteSocialLinks() {
  const [publicSettings, setPublicSettings] = useState<PublicSettings>(() => {
    const cached = getCachedPublicSettings();
    return cached && typeof cached === "object" ? (cached as PublicSettings) : {};
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const applySettings = (value?: PublicSettings) => {
      if (!mounted) return;
      setPublicSettings(
        value && typeof value === "object"
          ? value
          : ((getCachedPublicSettings() as PublicSettings) || {}),
      );
    };

    const sync = async () => {
      try {
        const nextSettings = await fetchPublicSettings();
        applySettings(nextSettings as PublicSettings);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const handleSettingsUpdate = (event: Event) => {
      const detail =
        event instanceof CustomEvent && event.detail && typeof event.detail === "object"
          ? (event.detail as PublicSettings)
          : undefined;
      applySettings(detail);
    };

    applySettings();
    void sync();
    window.addEventListener(SITE_BRANDING_UPDATED_EVENT, handleSettingsUpdate);

    return () => {
      mounted = false;
      window.removeEventListener(
        SITE_BRANDING_UPDATED_EVENT,
        handleSettingsUpdate,
      );
    };
  }, []);

  const config = useMemo(
    () => parseSiteSocialLinksConfig(publicSettings.social_links_config_json),
    [publicSettings],
  );
  const headerLinks = useMemo(
    () => getSiteSocialLinksForPlacement(config, "header"),
    [config],
  );
  const footerLinks = useMemo(
    () => getSiteSocialLinksForPlacement(config, "footer"),
    [config],
  );
  const pageLinks = useMemo(
    () => getSiteSocialLinksForPlacement(config, "page"),
    [config],
  );

  return {
    publicSettings,
    config,
    headerLinks,
    footerLinks,
    pageLinks,
    loading,
  };
}
