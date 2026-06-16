import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HOME_TRUST_BENEFITS,
  parseHomeTrustBenefits,
  parseHomeTrustHero,
  parseHomeTrustReviews,
} from "../src/lib/home-trust-settings.js";

test("home trust hero falls back from broken json", () => {
  const hero = parseHomeTrustHero("{not-json");

  assert.equal(hero.enabled, true);
  assert.equal(hero.primaryCtaText, "Смотреть новинки");
  assert.equal(hero.primaryCtaUrl, "/catalog?sort=new");
});

test("home trust hero rejects unsafe cta urls", () => {
  const hero = parseHomeTrustHero(
    JSON.stringify({
      title: "Custom",
      primaryCtaUrl: "javascript:alert(1)",
      secondaryCtaUrl: "ftp://example.test",
    }),
  );

  assert.equal(hero.primaryCtaUrl, "/catalog?sort=new");
  assert.equal(hero.secondaryCtaUrl, "/catalog");
});

test("home trust benefits are sorted and hidden items are excluded", () => {
  const benefits = parseHomeTrustBenefits(
    JSON.stringify({
      enabled: true,
      title: "Benefits",
      items: [
        { id: "b", title: "Second", description: "Visible", sortOrder: 20, enabled: true },
        { id: "hidden", title: "Hidden", description: "Hidden", sortOrder: 5, enabled: false },
        { id: "a", title: "First", description: "Visible", sortOrder: 10, enabled: true },
      ],
    }),
  );

  assert.deepEqual(
    benefits.items.map((item) => item.id),
    ["a", "b"],
  );
  assert.deepEqual(
    benefits.allItems.map((item) => item.id),
    ["hidden", "a", "b"],
  );
});

test("home trust defaults do not mention Poizon", () => {
  assert.doesNotMatch(JSON.stringify(DEFAULT_HOME_TRUST_BENEFITS), /poizon/i);
});

test("manual reviews keep valid otzovik links and hide disabled reviews", () => {
  const reviews = parseHomeTrustReviews(
    JSON.stringify({
      enabled: true,
      title: "Reviews",
      items: [
        {
          id: "manual",
          text: "Все отлично",
          author: "buyer",
          source: "Otzovik",
          sourceUrl: "https://otzovik.com/review_1.html",
          sortOrder: 10,
          enabled: true,
        },
        {
          id: "hidden",
          text: "hidden",
          author: "hidden",
          sourceUrl: "https://otzovik.com/review_2.html",
          sortOrder: 20,
          enabled: false,
        },
      ],
    }),
  );

  assert.equal(reviews.items.length, 1);
  assert.equal(reviews.items[0].sourceUrl, "https://otzovik.com/review_1.html");
});
