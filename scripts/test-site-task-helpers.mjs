import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFreeShippingToQuote,
  getFreeShippingState,
  normalizeFreeShippingThreshold,
  sortDeliveryCardsByPrice,
} from "../src/lib/checkout-shipping.js";
import { getCompactProductSizes } from "../src/lib/product-sizes.js";
import {
  DEFAULT_SITE_ACCENT_COLOR,
  normalizeHexColor,
  resolveSiteThemeSettings,
} from "../src/lib/site-theme.js";

test("site theme accepts only safe hex colors", () => {
  assert.equal(normalizeHexColor("#f00"), "#f00");
  assert.equal(normalizeHexColor("#ff1020"), "#ff1020");
  assert.equal(normalizeHexColor("red"), DEFAULT_SITE_ACCENT_COLOR);
  assert.equal(normalizeHexColor("javascript:alert(1)"), DEFAULT_SITE_ACCENT_COLOR);
});

test("site theme derives soft accent from selected color", () => {
  assert.deepEqual(resolveSiteThemeSettings({
    site_accent_color: "#102030",
    site_accent_hover_color: "#405060",
  }), {
    accent: "#102030",
    hover: "#405060",
    soft: "rgba(16, 32, 48, 0.16)",
    zones: {
      hero: {
        accent: "#102030",
        hover: "#405060",
        soft: "rgba(16, 32, 48, 0.16)",
      },
      decor: {
        accent: "#102030",
        hover: "#405060",
        soft: "rgba(16, 32, 48, 0.16)",
      },
      product: {
        accent: "#102030",
        hover: "#405060",
        soft: "rgba(16, 32, 48, 0.16)",
      },
      checkout: {
        accent: "#102030",
        hover: "#405060",
        soft: "rgba(16, 32, 48, 0.16)",
      },
    },
  });
});

test("site theme lets zones override base accent safely", () => {
  const theme = resolveSiteThemeSettings({
    site_accent_color: "#102030",
    site_accent_hover_color: "#405060",
    site_accent_hero_color: "#aa0000",
    site_accent_hero_hover_color: "#bb0000",
    site_accent_product_color: "not-a-color",
  });

  assert.equal(theme.zones.hero.accent, "#aa0000");
  assert.equal(theme.zones.hero.hover, "#bb0000");
  assert.equal(theme.zones.hero.soft, "rgba(170, 0, 0, 0.16)");
  assert.equal(theme.zones.product.accent, "#102030");
  assert.equal(theme.zones.checkout.hover, "#405060");
});

test("free shipping threshold uses sane fallback and state", () => {
  assert.equal(normalizeFreeShippingThreshold("5000"), 5000);
  assert.equal(normalizeFreeShippingThreshold("-1"), 5000);
  assert.deepEqual(getFreeShippingState(3200, 5000), {
    threshold: 5000,
    reached: false,
    remaining: 1800,
  });
  assert.deepEqual(getFreeShippingState(5000, 5000), {
    threshold: 5000,
    reached: true,
    remaining: 0,
  });
});

test("free shipping zeroes available quotes when subtotal reaches threshold", () => {
  const result = applyFreeShippingToQuote(
    { available: true, estimatedCost: 640, deliveryDays: 3 },
    5400,
    5000,
  );

  assert.equal(result.applied, true);
  assert.equal(result.originalCost, 640);
  assert.equal(result.quote.estimatedCost, 0);
});

test("delivery cards are sorted by availability and price", () => {
  const cards = sortDeliveryCardsByPrice([
    { provider: "slow", providerLabel: "Slow", available: true, quote: { estimatedCost: 900 } },
    { provider: "off", providerLabel: "Off", available: false, quote: { estimatedCost: 0 } },
    { provider: "fast", providerLabel: "Fast", available: true, quote: { estimatedCost: 300 } },
  ]);

  assert.deepEqual(cards.map((card) => card.provider), ["fast", "slow", "off"]);
});

test("product sizes show only sizes that have stock", () => {
  const result = getCompactProductSizes({
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    sizeStock: { XS: 0, S: 1, M: 2, L: 0, XL: 3, XXL: 4 },
  }, 3);

  assert.deepEqual(result.visible, ["S", "M", "XL"]);
  assert.equal(result.hiddenCount, 1);
  assert.equal(result.total, 4);
});
