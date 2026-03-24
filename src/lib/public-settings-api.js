import { apiRequest } from "@/lib/public-http";

export const getPublicSettings = async () => apiRequest("/settings/public-shell");

export const getPublicLegalDocument = async (key) =>
  apiRequest(`/settings/public-legal/${encodeURIComponent(key)}`);
