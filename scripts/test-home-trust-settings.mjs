import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HOME_TRUST_SETTINGS,
  DEFAULT_HOME_TRUST_BENEFITS,
  DEFAULT_HOME_TRUST_REVIEWS,
  HOME_TRUST_SETTINGS_KEYS,
  parseHomeTrustBenefits,
  parseHomeTrustHero,
  parseHomeTrustReviews,
} from "../src/lib/home-trust-settings.js";
import {
  getHomeAnchorRetryDelays,
  getHomeAnchorScrollTop,
  isHomeAnchorId,
} from "../src/lib/home-anchor-scroll.js";

test("home trust hero falls back from broken json", () => {
  const hero = parseHomeTrustHero("{not-json");

  assert.equal(hero.enabled, true);
  assert.equal(hero.eyebrowEnabled, false);
  assert.equal(hero.primaryCtaText, "Смотреть новинки");
  assert.equal(hero.primaryCtaUrl, "/catalog?sort=new");
  assert.match(hero.metaText, /5000/);
});

test("home trust settings include about page navigation flag", () => {
  assert.equal(DEFAULT_HOME_TRUST_SETTINGS.home_about_nav_to_page_enabled, "false");
  assert.ok(HOME_TRUST_SETTINGS_KEYS.includes("home_about_nav_to_page_enabled"));
});

test("home anchors only allow existing home sections", () => {
  assert.equal(isHomeAnchorId("about"), true);
  assert.equal(isHomeAnchorId("reviews"), true);
  assert.equal(isHomeAnchorId("new-arrivals"), true);
  assert.equal(isHomeAnchorId("catalog"), false);
  assert.equal(isHomeAnchorId(""), false);
});

test("home anchor scroll top keeps fixed header offset", () => {
  assert.equal(
    getHomeAnchorScrollTop({
      elementTop: 500,
      scrollY: 300,
      headerHeight: 80,
      extraOffset: 12,
    }),
    708,
  );
  assert.equal(
    getHomeAnchorScrollTop({
      elementTop: 20,
      scrollY: 0,
      headerHeight: 80,
      extraOffset: 12,
    }),
    0,
  );
});

test("home anchor retries are short and deterministic", () => {
  assert.deepEqual(getHomeAnchorRetryDelays(true), [120, 320, 700, 1200, 2000, 3000]);
  assert.deepEqual(getHomeAnchorRetryDelays(false), [160, 520, 1200]);
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
    benefits.items.map((item) => item.layout),
    ["left", "center"],
  );
  assert.deepEqual(
    benefits.allItems.map((item) => item.id),
    ["hidden", "a", "b"],
  );
});

test("home trust benefit layouts are normalized", () => {
  const benefits = parseHomeTrustBenefits(
    JSON.stringify({
      enabled: true,
      title: "Benefits",
      items: [
        { id: "a", title: "First", description: "Visible", layout: "right", enabled: true },
        { id: "b", title: "Second", description: "Visible", layout: "bad", enabled: true },
      ],
    }),
  );

  assert.deepEqual(
    benefits.items.map((item) => item.layout),
    ["right", "center"],
  );
});

test("home trust defaults do not mention Poizon", () => {
  assert.doesNotMatch(JSON.stringify(DEFAULT_HOME_TRUST_BENEFITS), /poizon/i);
});

test("home trust defaults use real otzovik review links", () => {
  const reviews = parseHomeTrustReviews(JSON.stringify(DEFAULT_HOME_TRUST_REVIEWS));

  assert.deepEqual(
    reviews.items.map((item) => item.sourceUrl),
    [
      "https://otzovik.com/review_18405429.html",
      "https://otzovik.com/review_18396489.html",
    ],
  );
  assert.deepEqual(
    reviews.items.map((item) => item.author),
    ["polporer", "dianka m"],
  );
  assert.deepEqual(
    reviews.items.map((item) => item.text),
    [
      "Заказывала пару вещичек (зипка + тишка). Мне все очень понравилось! доставка относительно быстрая. По размерам все отлично подошло, качество хорошее.",
      "Покупаю давно тут еще со времён когда в тг и озоне были вещи, качество нормальное, цены низкие, доставка быстрая;",
    ],
  );
  assert.doesNotMatch(JSON.stringify(reviews), /darkwave|inferno/i);
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
