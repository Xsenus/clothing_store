export const normalizeStartupUrl = () => {
  if (typeof window === "undefined") {
    return;
  }

  const legacyHomeHashes = new Set(["#new-arrivals"]);
  if (window.location.pathname === "/" && legacyHomeHashes.has(window.location.hash)) {
    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${window.location.search}`,
    );
  }
};
