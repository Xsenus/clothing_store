import { useEffect, useRef, useState } from "react";
import { FLOW } from "@/lib/api-mapping";

const normalizeAddressQuery = (value) => String(value || "").trim();

const mapSuggestions = (payload) => {
  if (!Array.isArray(payload?.suggestions)) {
    return [];
  }

  const seen = new Set();
  const nextSuggestions = [];

  payload.suggestions.forEach((item) => {
    const value = String(item?.unrestrictedValue || item?.value || "").trim();
    if (!value || seen.has(value)) {
      return;
    }

    seen.add(value);
    nextSuggestions.push({
      value,
      label: value,
      rawValue: String(item?.value || "").trim(),
    });
  });

  return nextSuggestions;
};

export function useAddressSuggestions(value, options = {}) {
  const {
    enabled = true,
    minQueryLength = 4,
    debounceMs = 300,
    count = 5,
  } = options;

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const ignoredQueryRef = useRef("");

  useEffect(() => {
    const query = normalizeAddressQuery(value);
    const currentRequestId = ++requestIdRef.current;

    if (!enabled || query.length < minQueryLength) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }

    if (query === ignoredQueryRef.current) {
      ignoredQueryRef.current = "";
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setSuggestions([]);

      try {
        const result = await FLOW.dadataSuggestAddresses({
          input: {
            query,
            count,
          },
        });

        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        setSuggestions(mapSuggestions(result));
      } catch {
        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        setSuggestions([]);
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [count, debounceMs, enabled, minQueryLength, value]);

  return {
    suggestions,
    loading,
    clearSuggestions: () => setSuggestions([]),
    ignoreNextLookup: (nextValue) => {
      ignoredQueryRef.current = normalizeAddressQuery(nextValue);
    },
  };
}
