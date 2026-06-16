export const DEFAULT_SITE_ACCENT_COLOR = "#dc2626";
export const DEFAULT_SITE_ACCENT_HOVER_COLOR = "#ef4444";
export const DEFAULT_SITE_ACCENT_SOFT_COLOR = "rgba(220, 38, 38, 0.16)";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const normalizeHexColor = (value, fallback = DEFAULT_SITE_ACCENT_COLOR) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : fallback;
};

const hexToRgb = (hexColor) => {
  const normalized = normalizeHexColor(hexColor);
  const raw = normalized.slice(1);
  const expanded = raw.length === 3
    ? raw.split("").map((char) => `${char}${char}`).join("")
    : raw;

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
};

export const resolveSiteThemeSettings = (settings = {}) => {
  const accent = normalizeHexColor(settings.site_accent_color, DEFAULT_SITE_ACCENT_COLOR);
  const hover = normalizeHexColor(settings.site_accent_hover_color, DEFAULT_SITE_ACCENT_HOVER_COLOR);
  const rgb = hexToRgb(accent);

  return {
    accent,
    hover,
    soft: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`,
  };
};

export const applySiteThemeSettings = (settings = {}) => {
  if (typeof document === "undefined") {
    return resolveSiteThemeSettings(settings);
  }

  const theme = resolveSiteThemeSettings(settings);
  const root = document.documentElement;
  root.style.setProperty("--fd-accent", theme.accent);
  root.style.setProperty("--fd-accent-hover", theme.hover);
  root.style.setProperty("--fd-accent-soft", theme.soft);
  return theme;
};
