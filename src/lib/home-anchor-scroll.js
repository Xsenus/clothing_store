export const HOME_ANCHOR_IDS = new Set(["about", "reviews", "new-arrivals"]);

export const isHomeAnchorId = (value) =>
  typeof value === "string" && HOME_ANCHOR_IDS.has(value);

export const getHomeAnchorScrollTop = ({
  elementTop,
  scrollY = 0,
  headerHeight = 0,
  extraOffset = 12,
}) => Math.max(0, elementTop + scrollY - headerHeight - extraOffset);

export const getHomeAnchorRetryDelays = (isMobileViewport) =>
  isMobileViewport ? [120, 320, 700, 1200, 2000, 3000] : [160, 520, 1200];
