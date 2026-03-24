import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const mode = process.argv[2] || process.env.NODE_ENV || "production";
const outDirFlagIndex = process.argv.indexOf("--out-dir");
const outDir =
  outDirFlagIndex >= 0 ? process.argv[outDirFlagIndex + 1] : "dist";
const outputDir = path.resolve(projectRoot, outDir);
const env = loadEnv(mode, projectRoot, "");

const defaultSiteUrl = "https://fashiondemon.shop";
const defaultSiteTitle = "fashiondemon";
const defaultSiteDescription =
  "fashiondemon - магазин одежды и стритвира: новые коллекции, популярные модели и доставка по России.";
const siteUrl = normalizeSiteUrl(
  env.VITE_SITE_URL ||
    process.env.VITE_SITE_URL ||
    process.env.SITE_URL ||
    defaultSiteUrl,
);
const buildTimestamp = new Date().toISOString();

const staticRoutes = [
  {
    path: "/",
    title: defaultSiteTitle,
    description: defaultSiteDescription,
    changefreq: "daily",
    priority: "1.0",
    image: "/favicon.ico",
    ogType: "website",
    structuredData: ({ canonicalUrl, imageUrl }) => [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: defaultSiteTitle,
        url: canonicalUrl,
        logo: imageUrl,
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: defaultSiteTitle,
        url: canonicalUrl,
        inLanguage: "ru-RU",
      },
    ],
    shell: renderHomeShell(),
  },
  {
    path: "/catalog",
    title: `Каталог | ${defaultSiteTitle}`,
    description:
      "Каталог fashiondemon: новинки, популярные модели и актуальные streetwear-коллекции.",
    changefreq: "daily",
    priority: "0.9",
    image: "/favicon.ico",
    ogType: "website",
    structuredData: ({ canonicalUrl }) => ({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Каталог fashiondemon",
      url: canonicalUrl,
      inLanguage: "ru-RU",
    }),
    shell: renderCatalogShell(),
  },
  {
    path: "/privacy",
    title: `Политика конфиденциальности | ${defaultSiteTitle}`,
    description:
      "Политика конфиденциальности fashiondemon: как мы обрабатываем и защищаем персональные данные.",
    changefreq: "yearly",
    priority: "0.2",
    image: "/favicon.ico",
    ogType: "article",
    structuredData: ({ canonicalUrl }) => ({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Политика конфиденциальности",
      url: canonicalUrl,
      inLanguage: "ru-RU",
    }),
    shell: renderLegalShell({
      title: "Политика конфиденциальности",
      description:
        "Собрали ключевые правила обработки персональных данных, cookies и контактной информации покупателей.",
      bullets: [
        "Какие данные мы получаем при заказе и регистрации.",
        "Для чего используется аналитика и технические cookies.",
        "Как запросить уточнение, удаление или обновление данных.",
      ],
    }),
  },
  {
    path: "/terms",
    title: `Пользовательское соглашение | ${defaultSiteTitle}`,
    description:
      "Пользовательское соглашение fashiondemon: правила использования сайта, аккаунта и онлайн-заказов.",
    changefreq: "yearly",
    priority: "0.2",
    image: "/favicon.ico",
    ogType: "article",
    structuredData: ({ canonicalUrl }) => ({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Пользовательское соглашение",
      url: canonicalUrl,
      inLanguage: "ru-RU",
    }),
    shell: renderLegalShell({
      title: "Пользовательское соглашение",
      description:
        "На странице доступны условия использования сайта, личного кабинета и базовые правила взаимодействия с сервисом.",
      bullets: [
        "Права и обязанности покупателя при использовании сайта.",
        "Правила регистрации, авторизации и безопасности аккаунта.",
        "Ограничения ответственности и порядок связи по спорным вопросам.",
      ],
    }),
  },
  {
    path: "/offer",
    title: `Публичная оферта | ${defaultSiteTitle}`,
    description:
      "Публичная оферта fashiondemon: условия оформления заказа, оплаты, доставки и возврата.",
    changefreq: "yearly",
    priority: "0.2",
    image: "/favicon.ico",
    ogType: "article",
    structuredData: ({ canonicalUrl }) => ({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Публичная оферта",
      url: canonicalUrl,
      inLanguage: "ru-RU",
    }),
    shell: renderLegalShell({
      title: "Публичная оферта",
      description:
        "Краткий обзор условий покупки: подтверждение заказа, порядок оплаты, доставки и обмена.",
      bullets: [
        "Когда заказ считается принятым продавцом.",
        "Какие способы оплаты и доставки доступны покупателю.",
        "Как оформляется отмена, возврат и обмен товара.",
      ],
    }),
  },
  {
    path: "/returns",
    title: `Возврат и обмен | ${defaultSiteTitle}`,
    description:
      "Условия возврата и обмена fashiondemon: сроки, состояние товара и порядок обращения в поддержку.",
    changefreq: "yearly",
    priority: "0.2",
    image: "/favicon.ico",
    ogType: "article",
    structuredData: ({ canonicalUrl }) => ({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Возврат и обмен",
      url: canonicalUrl,
      inLanguage: "ru-RU",
    }),
    shell: renderLegalShell({
      title: "Возврат и обмен",
      description:
        "Подготовили краткую памятку по срокам возврата, состоянию товара и документам для обращения.",
      bullets: [
        "Сроки и условия возврата для товаров надлежащего качества.",
        "Требования к комплектности, упаковке и подтверждению покупки.",
        "Порядок связи с магазином и статусы обработки обращения.",
      ],
    }),
  },
];

await fs.mkdir(outputDir, { recursive: true });

const productEntries = await readProductEntries(
  path.resolve(projectRoot, "seed", "products.jsonl"),
);
const productRoutes = await Promise.all(
  productEntries.map(async (entry) => {
    const image = await resolvePrerenderImage(pickFirstImage(entry.images));
    const canonicalUrl = buildAbsoluteUrl(siteUrl, `/product/${entry.slug}`);

    return {
      path: `/product/${entry.slug}`,
      title: `${entry.name} | ${defaultSiteTitle}`,
      description: truncateText(
        entry.description ||
          `${entry.name} от ${defaultSiteTitle}. Уточняйте наличие, размеры и условия доставки.`,
        160,
      ),
      changefreq: "weekly",
      priority: "0.8",
      image,
      ogType: "product",
      loc: canonicalUrl,
      lastmod: buildTimestamp,
      structuredData: ({ imageUrl }) => ({
        "@context": "https://schema.org",
        "@type": "Product",
        name: entry.name,
        image: [imageUrl],
        description: truncateText(entry.description || entry.name, 160),
        brand: {
          "@type": "Brand",
          name: defaultSiteTitle,
        },
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          priceCurrency: "RUB",
          price: entry.price || 0,
          url: canonicalUrl,
        },
      }),
      shell: renderProductShell(entry, image),
    };
  }),
);
const routeEntries = dedupeRoutes([
  ...staticRoutes.map((route) => ({
    ...route,
    loc: buildAbsoluteUrl(siteUrl, route.path),
    lastmod: buildTimestamp,
  })),
  ...productRoutes,
]);

await fs.writeFile(
  path.join(outputDir, "sitemap.xml"),
  renderSitemap(routeEntries),
  "utf8",
);
await fs.writeFile(
  path.join(outputDir, "robots.txt"),
  renderRobots(siteUrl),
  "utf8",
);

const templateHtml = await readBuiltIndexHtml(path.join(outputDir, "index.html"));
if (templateHtml) {
  await Promise.all(
    routeEntries.map((route) => {
      const routeHtml = buildRouteHtml(templateHtml, route);
      return writeRouteHtml(outputDir, route.path, routeHtml);
    }),
  );
}

console.log(
  `Generated SEO assets in ${path.relative(projectRoot, outputDir)} for ${siteUrl} (${routeEntries.length} URLs).`,
);

function normalizeSiteUrl(value) {
  const normalized = String(value || "").trim();
  const url = new URL(normalized || defaultSiteUrl);
  return url.toString().replace(/\/$/, "");
}

function buildAbsoluteUrl(baseUrl, pathname) {
  const normalizedPath = pathname === "/" ? "" : pathname.replace(/^\/+/, "");
  return new URL(normalizedPath, `${baseUrl}/`).toString();
}

async function readBuiltIndexHtml(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readProductEntries(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(
        (item) =>
          item &&
          typeof item.slug === "string" &&
          item.slug.trim() &&
          typeof item.name === "string" &&
          item.name.trim(),
      )
      .map((item) => ({
        slug: item.slug.trim(),
        name: String(item.name || "").trim(),
        description: String(item.description || "").trim(),
        price: Number(item.price || 0),
        images: Array.isArray(item.images)
          ? item.images.map((value) => String(value || "").trim()).filter(Boolean)
          : [],
      }));
  } catch {
    return [];
  }
}

function dedupeRoutes(entries) {
  const seen = new Set();

  return entries.filter((entry) => {
    const key = entry.loc || entry.path;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function renderSitemap(entries) {
  const body = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function renderRobots(baseUrl) {
  return `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${buildAbsoluteUrl(baseUrl, "/sitemap.xml")}
`;
}

function buildRouteHtml(templateHtml, route) {
  const canonicalUrl = buildAbsoluteUrl(siteUrl, route.path);
  const imageUrl = buildAbsoluteUrl(siteUrl, route.image || "/favicon.ico");
  const structuredData =
    typeof route.structuredData === "function"
      ? route.structuredData({
          canonicalUrl,
          imageUrl,
          path: route.path,
          title: route.title,
          description: route.description,
        })
      : route.structuredData;

  let html = templateHtml;
  html = replaceRootMarkup(html, route.shell || "");
  html = replaceTitle(html, route.title || defaultSiteTitle);
  html = upsertMeta(html, "name", "description", route.description || defaultSiteDescription);
  html = upsertMeta(html, "name", "robots", "index,follow");
  html = upsertMeta(html, "name", "application-name", defaultSiteTitle);
  html = upsertMeta(html, "name", "apple-mobile-web-app-title", defaultSiteTitle);
  html = upsertMeta(html, "property", "og:type", route.ogType || "website");
  html = upsertMeta(html, "property", "og:site_name", defaultSiteTitle);
  html = upsertMeta(html, "property", "og:title", route.title || defaultSiteTitle);
  html = upsertMeta(
    html,
    "property",
    "og:description",
    route.description || defaultSiteDescription,
  );
  html = upsertMeta(html, "property", "og:url", canonicalUrl);
  html = upsertMeta(html, "property", "og:locale", "ru_RU");
  html = upsertMeta(html, "property", "og:image", imageUrl);
  html = upsertMeta(
    html,
    "name",
    "twitter:card",
    imageUrl.endsWith(".ico") ? "summary" : "summary_large_image",
  );
  html = upsertMeta(html, "name", "twitter:title", route.title || defaultSiteTitle);
  html = upsertMeta(
    html,
    "name",
    "twitter:description",
    route.description || defaultSiteDescription,
  );
  html = upsertMeta(html, "name", "twitter:image", imageUrl);
  html = upsertLink(html, "canonical", canonicalUrl);
  html = upsertStyleTag(html, getPrerenderShellStyles());
  html = upsertStructuredData(html, structuredData);
  return html;
}

async function writeRouteHtml(baseDir, pathname, html) {
  const normalizedPath =
    pathname === "/" ? [] : pathname.replace(/^\/+|\/+$/g, "").split("/");
  const routeDir = path.join(baseDir, ...normalizedPath);
  const outputPath = path.join(routeDir, "index.html");

  await fs.mkdir(routeDir, { recursive: true });
  await fs.writeFile(outputPath, html, "utf8");
}

function replaceRootMarkup(html, shell) {
  const rootMarkup = `<div id="root">${shell}</div>`;

  return html.replace(/<div id="root"><\/div>/i, rootMarkup);
}

function replaceTitle(html, value) {
  const titleTag = `<title>${escapeHtml(value)}</title>`;

  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, titleTag);
  }

  return html.replace("</head>", `  ${titleTag}\n</head>`);
}

function upsertMeta(html, attribute, key, content) {
  const escapedKey = escapeRegExp(key);
  const tag = `<meta ${attribute}="${escapeAttribute(key)}" content="${escapeAttribute(
    content,
  )}" />`;
  const pattern = new RegExp(
    `<meta\\s+[^>]*${attribute}=["']${escapedKey}["'][^>]*>`,
    "i",
  );

  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace("</head>", `  ${tag}\n</head>`);
}

function upsertLink(html, rel, href) {
  const escapedRel = escapeRegExp(rel);
  const tag = `<link rel="${escapeAttribute(rel)}" href="${escapeAttribute(href)}" />`;
  const pattern = new RegExp(`<link\\s+[^>]*rel=["']${escapedRel}["'][^>]*>`, "i");

  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace("</head>", `  ${tag}\n</head>`);
}

function upsertStyleTag(html, cssText) {
  const tag = `<style data-prerender-shell>${cssText}</style>`;
  const pattern = /<style data-prerender-shell>[\s\S]*?<\/style>/i;

  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace("</head>", `  ${tag}\n</head>`);
}

function upsertStructuredData(html, payload) {
  const pattern =
    /<script id="prerender-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/i;
  const cleanedHtml = html.replace(pattern, "");

  if (!payload) {
    return cleanedHtml;
  }

  const tag = `<script id="prerender-structured-data" type="application/ld+json">${escapeScriptContent(
    JSON.stringify(payload),
  )}</script>`;

  return cleanedHtml.replace("</head>", `  ${tag}\n</head>`);
}

function renderHomeShell() {
  return `<div class="prerender-shell">
  ${renderTopBar()}
  <main>
    <section class="prerender-hero">
      <div class="prerender-hero__overlay"></div>
      <div class="prerender-container">
        <div class="prerender-hero__content">
          <div class="prerender-eyebrow">streetwear store</div>
          <h1 class="prerender-hero__title">FASHION<br />DEMON</h1>
          <p class="prerender-hero__copy">Уличная мода. Переосмыслена.</p>
          <a class="prerender-button" href="#new-arrivals">В магазин</a>
        </div>
      </div>
    </section>
    <section class="prerender-band">
      <div class="prerender-container">
        <div class="prerender-collection"></div>
      </div>
    </section>
    <section class="prerender-section" id="new-arrivals">
      <div class="prerender-container">
        <div class="prerender-section__header">
          <h2>Новинки</h2>
          <a href="/catalog?sort=new">Все</a>
        </div>
        ${renderProductGridSkeleton()}
      </div>
    </section>
    <section class="prerender-section prerender-section--dark">
      <div class="prerender-container">
        <div class="prerender-section__header">
          <h2>В тренде</h2>
          <a href="/catalog?sort=popular">Все</a>
        </div>
        ${renderProductGridSkeleton(true)}
      </div>
    </section>
  </main>
  ${renderFooterShell()}
</div>`;
}

function renderCatalogShell() {
  return `<div class="prerender-shell prerender-shell--light">
  ${renderTopBar()}
  <main class="prerender-page">
    <div class="prerender-container">
      <div class="prerender-page__intro">
        <div class="prerender-eyebrow">Каталог</div>
        <h1>Каталог fashiondemon</h1>
        <p>Новинки, популярные модели и актуальные коллекции streetwear в одном каталоге.</p>
      </div>
      <div class="prerender-filter-row">
        <span>Фильтры</span>
        <span>Сортировка</span>
        <span>Размеры</span>
        <span>Коллекции</span>
      </div>
      ${renderProductGridSkeleton()}
    </div>
  </main>
  ${renderFooterShell()}
</div>`;
}

function renderLegalShell({ title, description, bullets }) {
  return `<div class="prerender-shell prerender-shell--light">
  ${renderTopBar()}
  <main class="prerender-page">
    <div class="prerender-container prerender-copy-page">
      <div class="prerender-page__intro">
        <div class="prerender-eyebrow">Информация</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="prerender-copy-card">
        ${bullets
          .map(
            (item) =>
              `<div class="prerender-copy-row"><span class="prerender-copy-dot"></span><p>${escapeHtml(
                item,
              )}</p></div>`,
          )
          .join("")}
      </div>
    </div>
  </main>
  ${renderFooterShell()}
</div>`;
}

function renderProductShell(entry, previewImage = "/favicon.ico") {
  const imageMarkup = previewImage && previewImage !== "/favicon.ico"
    ? `<img class="prerender-product__image" src="${escapeAttribute(
        previewImage,
      )}" alt="${escapeAttribute(entry.name)}" loading="eager" decoding="async" fetchpriority="high" />`
    : `<div class="prerender-product__image prerender-product__image--placeholder"></div>`;

  return `<div class="prerender-shell prerender-shell--light">
  ${renderTopBar()}
  <main class="prerender-page">
    <div class="prerender-container prerender-product">
      <div class="prerender-product__media">${imageMarkup}</div>
      <div class="prerender-product__content">
        <div class="prerender-eyebrow">Карточка товара</div>
        <h1>${escapeHtml(entry.name)}</h1>
        <p class="prerender-product__price">${formatPrice(entry.price)}</p>
        <p class="prerender-product__description">${escapeHtml(
          truncateText(entry.description || entry.name, 220),
        )}</p>
        <div class="prerender-chip-row">
          <span class="prerender-chip">Доставка по России</span>
          <span class="prerender-chip">Онлайн-оплата</span>
          <span class="prerender-chip">Streetwear</span>
        </div>
        <div class="prerender-action-row">
          <span class="prerender-button prerender-button--muted">Добавить в корзину</span>
          <a class="prerender-link" href="/catalog">Вернуться в каталог</a>
        </div>
      </div>
    </div>
  </main>
  ${renderFooterShell()}
</div>`;
}

function renderTopBar() {
  return `<header class="prerender-topbar">
  <div class="prerender-container prerender-topbar__inner">
    <a class="prerender-brand" href="/">FASHION_DEMON</a>
    <nav class="prerender-nav">
      <a href="/">Главная</a>
      <a href="/catalog">Каталог</a>
      <a href="/cart">Корзина</a>
    </nav>
  </div>
</header>`;
}

function renderFooterShell() {
  return `<footer class="prerender-footer">
  <div class="prerender-container prerender-footer__inner">
    <div>
      <div class="prerender-footer__brand">FASHION_DEMON</div>
      <p class="prerender-footer__copy">Переосмысляем уличную моду с выразительной эстетикой и вниманием к деталям.</p>
    </div>
    <div class="prerender-footer__links">
      <a href="/privacy">Политика конфиденциальности</a>
      <a href="/terms">Пользовательское соглашение</a>
      <a href="/offer">Публичная оферта</a>
      <a href="/returns">Возврат и обмен</a>
    </div>
  </div>
</footer>`;
}

function renderProductGridSkeleton(dark = false) {
  const cardClassName = dark
    ? "prerender-card prerender-card--dark"
    : "prerender-card";

  return `<div class="prerender-grid">
    ${Array.from({ length: 4 })
      .map(
        () => `<div class="${cardClassName}">
        <div class="prerender-card__media"></div>
        <div class="prerender-card__body">
          <div class="prerender-line prerender-line--lg"></div>
          <div class="prerender-line prerender-line--sm"></div>
        </div>
      </div>`,
      )
      .join("")}
  </div>`;
}

function pickFirstImage(images) {
  return Array.isArray(images) ? images.find(Boolean) || "" : "";
}

async function resolvePrerenderImage(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "/favicon.ico";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const relativePath = normalized.replace(/^\/+/, "");
  const candidatePaths = [
    path.resolve(projectRoot, "public", relativePath),
    path.resolve(outputDir, relativePath),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const stat = await fs.stat(candidatePath);
      if (stat.isFile()) {
        return normalized.startsWith("/") ? normalized : `/${relativePath}`;
      }
    } catch {
      continue;
    }
  }

  return "/favicon.ico";
}

function truncateText(value = "", maxLength = 160) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatPrice(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "Цена уточняется";
  }

  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeScriptContent(value) {
  return String(value).replace(/<\/script/gi, "<\\/script");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPrerenderShellStyles() {
  return `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#0a0a0a;color:#111827;font-family:"Segoe UI",Arial,sans-serif}
a{text-decoration:none;color:inherit}
.prerender-shell{min-height:100vh;background:#fff;color:#111827}
.prerender-container{width:min(1200px,calc(100% - 2rem));margin:0 auto}
.prerender-topbar{position:sticky;top:0;z-index:2;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.92);backdrop-filter:blur(12px)}
.prerender-topbar__inner{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:72px}
.prerender-brand{font-size:1.1rem;font-weight:900;letter-spacing:.14em;color:#fff}
.prerender-nav{display:flex;flex-wrap:wrap;gap:1rem;color:rgba(255,255,255,.78);font-size:.92rem;text-transform:uppercase;letter-spacing:.08em}
.prerender-hero{position:relative;display:flex;align-items:center;min-height:calc(100vh - 72px);overflow:hidden;background:radial-gradient(circle at center,#2d2d2d 0%,#050505 58%,#000 100%);color:#fff}
.prerender-hero__overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.72))}
.prerender-hero__content{position:relative;z-index:1;max-width:760px;padding:5rem 0 4rem;text-align:center}
.prerender-eyebrow{margin-bottom:1rem;color:rgba(255,255,255,.72);font-size:.78rem;font-weight:700;letter-spacing:.26em;text-transform:uppercase}
.prerender-hero__title{margin:0;font-size:clamp(3.5rem,14vw,8rem);font-weight:950;line-height:.9;letter-spacing:-.08em}
.prerender-hero__copy{margin:1.5rem auto 0;max-width:28rem;color:rgba(255,255,255,.8);font-size:1.05rem;letter-spacing:.08em;text-transform:uppercase}
.prerender-button{display:inline-flex;align-items:center;justify-content:center;margin-top:2rem;min-height:56px;padding:0 1.6rem;border:1px solid #fff;background:#fff;color:#111827;font-size:.9rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.prerender-button--muted{border-color:#111827;background:#111827;color:#fff}
.prerender-band,.prerender-section,.prerender-page{padding:4rem 0}
.prerender-band{background:#fff}
.prerender-collection{min-height:320px;border:1px solid rgba(17,24,39,.08);background:linear-gradient(135deg,#f5f5f4,#fafaf9)}
.prerender-section--dark,.prerender-footer{background:#050505;color:#fff}
.prerender-section__header{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:2rem}
.prerender-section__header h2,.prerender-page__intro h1{margin:0;font-size:clamp(2rem,6vw,4rem);font-weight:950;letter-spacing:-.06em;text-transform:uppercase}
.prerender-section__header a{font-size:.85rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.prerender-page__intro{max-width:52rem;margin-bottom:2rem}
.prerender-page__intro p,.prerender-product__description,.prerender-footer__copy,.prerender-copy-row p{margin:0;color:#4b5563;line-height:1.7}
.prerender-grid{display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:1.25rem}
.prerender-card{overflow:hidden;border:1px solid rgba(17,24,39,.08);background:#fff}
.prerender-card--dark{border-color:rgba(255,255,255,.12);background:#111}
.prerender-card__media{aspect-ratio:1;background:#f5f5f4}
.prerender-card--dark .prerender-card__media{background:rgba(255,255,255,.06)}
.prerender-card__body{padding:1rem}
.prerender-line{height:14px;border-radius:999px;background:#e7e5e4}
.prerender-card--dark .prerender-line{background:rgba(255,255,255,.1)}
.prerender-line--lg{width:72%}
.prerender-line--sm{width:42%;margin-top:.75rem}
.prerender-filter-row{display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:2rem}
.prerender-filter-row span,.prerender-chip{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 1rem;border:1px solid rgba(17,24,39,.12);background:#fff;color:#111827;font-size:.82rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.prerender-copy-page{max-width:880px}
.prerender-copy-card{display:grid;gap:1rem;padding:1.5rem;border:1px solid rgba(17,24,39,.08);background:#fff}
.prerender-copy-row{display:flex;align-items:flex-start;gap:.9rem}
.prerender-copy-dot{display:inline-block;flex:0 0 10px;height:10px;margin-top:.5rem;border-radius:999px;background:#111827}
.prerender-product{display:grid;gap:2rem}
.prerender-product__media{overflow:hidden;border:1px solid rgba(17,24,39,.08);background:#f5f5f4}
.prerender-product__image{display:block;width:100%;aspect-ratio:1 / 1;object-fit:cover}
.prerender-product__image--placeholder{aspect-ratio:1 / 1;background:#f5f5f4}
.prerender-product__content{display:flex;flex-direction:column;gap:1rem}
.prerender-product__price{margin:0;color:#111827;font-size:1.5rem;font-weight:900;letter-spacing:-.03em}
.prerender-chip-row,.prerender-action-row,.prerender-footer__links{display:flex;flex-wrap:wrap;gap:.75rem}
.prerender-link{font-size:.88rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#111827}
.prerender-footer{padding:3rem 0}
.prerender-footer__inner{display:grid;gap:1.5rem}
.prerender-footer__brand{margin-bottom:.75rem;font-size:1.15rem;font-weight:900;letter-spacing:.14em}
.prerender-footer__copy{max-width:32rem;color:rgba(255,255,255,.72)}
.prerender-footer__links a{color:rgba(255,255,255,.82);font-size:.85rem;font-weight:700;letter-spacing:.06em}
@media (min-width: 768px){
  .prerender-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .prerender-product{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);align-items:start}
  .prerender-footer__inner{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}
}
@media (min-width: 1024px){
  .prerender-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
}
`;
}
