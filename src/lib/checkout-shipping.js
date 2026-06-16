export const DEFAULT_FREE_SHIPPING_THRESHOLD = 5000;

export const normalizeFreeShippingThreshold = (
  value,
  fallback = DEFAULT_FREE_SHIPPING_THRESHOLD,
) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : fallback;
};

export const getFreeShippingState = (subtotal, thresholdValue) => {
  const threshold = normalizeFreeShippingThreshold(thresholdValue);
  const normalizedSubtotal = Math.max(0, Number(subtotal) || 0);
  const remaining = Math.max(0, threshold - normalizedSubtotal);

  return {
    threshold,
    reached: normalizedSubtotal >= threshold,
    remaining,
  };
};

export const applyFreeShippingToQuote = (quote, subtotal, thresholdValue) => {
  if (!quote || quote.available === false) {
    return { quote, applied: false, originalCost: null };
  }

  const { reached } = getFreeShippingState(subtotal, thresholdValue);
  const originalCost = Math.max(0, Number(quote.estimatedCost) || 0);

  if (!reached || originalCost <= 0) {
    return { quote, applied: false, originalCost };
  }

  return {
    quote: {
      ...quote,
      estimatedCost: 0,
    },
    applied: true,
    originalCost,
  };
};

export const getDeliveryCardPriceValue = (card) => {
  if (!card?.available) {
    return Number.POSITIVE_INFINITY;
  }

  const cost = Number(card.quote?.estimatedCost);
  return Number.isFinite(cost) ? Math.max(0, cost) : Number.POSITIVE_INFINITY;
};

export const sortDeliveryCardsByPrice = (cards = []) =>
  [...cards].sort((left, right) => {
    const leftAvailable = left?.available === true;
    const rightAvailable = right?.available === true;

    if (leftAvailable !== rightAvailable) {
      return leftAvailable ? -1 : 1;
    }

    const priceDifference = getDeliveryCardPriceValue(left) - getDeliveryCardPriceValue(right);
    if (priceDifference !== 0) {
      return priceDifference;
    }

    return String(left?.providerLabel || left?.provider || "").localeCompare(
      String(right?.providerLabel || right?.provider || ""),
      "ru",
    );
  });
