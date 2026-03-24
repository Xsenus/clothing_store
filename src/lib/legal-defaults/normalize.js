export const normalizeLegalText = (text) =>
  String(text || "").replace(/\r\n/g, "\n").trim();
