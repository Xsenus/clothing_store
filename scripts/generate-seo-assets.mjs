import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const mode = process.argv[2] || process.env.NODE_ENV || "production";
const outDirFlagIndex = process.argv.indexOf("--out-dir");
const outDir = outDirFlagIndex >= 0 ? process.argv[outDirFlagIndex + 1] : "dist";
const outputDir = path.resolve(projectRoot, outDir);
const env = loadEnv(mode, projectRoot, "");

const staticRoutes = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/catalog", changefreq: "daily", priority: "0.9" },
  { path: "/privacy", changefreq: "yearly", priority: "0.2" },
  { path: "/terms", changefreq: "yearly", priority: "0.2" },
  { path: "/offer", changefreq: "yearly", priority: "0.2" },
];

const siteUrl = normalizeSiteUrl(env.VITE_SITE_URL || process.env.VITE_SITE_URL || "http://localhost:5173");
const buildTimestamp = new Date().toISOString();

await fs.mkdir(outputDir, { recursive: true });

const productEntries = await readProductEntries(path.resolve(projectRoot, "seed", "products.jsonl"));
const urls = dedupeRoutes([
  ...staticRoutes.map((route) => ({
    ...route,
    loc: buildAbsoluteUrl(siteUrl, route.path),
    lastmod: buildTimestamp,
  })),
  ...productEntries.map((entry) => ({
    path: `/product/${entry.slug}`,
    loc: buildAbsoluteUrl(siteUrl, `/product/${entry.slug}`),
    changefreq: "weekly",
    priority: "0.8",
    lastmod: buildTimestamp,
  })),
]);

await fs.writeFile(path.join(outputDir, "sitemap.xml"), renderSitemap(urls), "utf8");
await fs.writeFile(path.join(outputDir, "robots.txt"), renderRobots(siteUrl), "utf8");

console.log(
  `Generated SEO assets in ${path.relative(projectRoot, outputDir)} for ${siteUrl} (${urls.length} URLs).`
);

function normalizeSiteUrl(value) {
  const normalized = String(value || "").trim();
  const url = new URL(normalized || "http://localhost:5173");
  return url.toString().replace(/\/$/, "");
}

function buildAbsoluteUrl(baseUrl, pathname) {
  const normalizedPath = pathname === "/" ? "" : pathname.replace(/^\/+/, "");
  return new URL(normalizedPath, `${baseUrl}/`).toString();
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
      .filter((item) => item && typeof item.slug === "string" && item.slug.trim())
      .map((item) => ({ slug: item.slug.trim() }));
  } catch {
    return [];
  }
}

function dedupeRoutes(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (seen.has(entry.loc)) {
      return false;
    }

    seen.add(entry.loc);
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
  </url>`
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

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
