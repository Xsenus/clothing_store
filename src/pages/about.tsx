import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import Header from "@/components/Header";
import PageSeo from "@/components/PageSeo";
import { fetchPublicSettings, getCachedPublicSettings } from "@/lib/site-settings";
import { parseHomeTrustSettings } from "@/lib/home-trust-settings";

const Footer = lazy(() => import("@/components/Footer"));

const ABOUT_KEYWORDS = [
  "fashiondemon",
  "о fashion demon",
  "отзывы fashion demon",
  "otzovik fashion demon",
  "магазин одежды",
  "streetwear",
];

function FooterPlaceholder() {
  return <div className="min-h-[220px] bg-black" aria-hidden="true" />;
}

function AboutDetailsSection({ about }: { about: any }) {
  if (!about.enabled) return null;

  return (
    <section className="bg-black py-16 text-white sm:py-24">
      <div className="container mx-auto grid gap-10 px-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div className="space-y-6">
          <p className="text-sm font-black uppercase tracking-[0.34em] text-[var(--fd-accent-decor)]">
            {about.eyebrow}
          </p>
          <h1 className="max-w-full break-words text-[2.12rem] font-black uppercase leading-[0.92] tracking-normal sm:text-5xl lg:max-w-4xl lg:text-7xl">
            {about.title}
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-white/64 md:text-xl md:leading-9">
            {about.text}
          </p>
        </div>

        {about.highlights.length > 0 ? (
          <div className="grid gap-3">
            {about.highlights.map((item: any, index: number) => (
              <article
                key={item.id}
                className="border border-white/14 bg-white/[0.04] p-5 sm:p-6"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--fd-accent-decor)] text-sm font-black text-white">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-xl font-black uppercase leading-tight sm:text-2xl">
                    {item.title}
                  </h2>
                </div>
                <p className="text-base leading-7 text-white/62">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AboutReviewsSection({ reviews }: { reviews: any }) {
  if (!reviews.enabled || reviews.items.length === 0) return null;

  return (
    <section className="bg-[#111114] py-16 text-white sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mb-10 max-w-3xl space-y-4">
          <p className="text-sm font-black uppercase tracking-[0.34em] text-[var(--fd-accent-decor)]">
            {reviews.sourceLabel}
          </p>
          <h2 className="max-w-full break-words text-[2rem] font-black uppercase leading-[0.95] tracking-normal sm:text-5xl lg:text-6xl">
            {reviews.title}
          </h2>
          {reviews.description ? (
            <p className="text-lg leading-8 text-white/58">
              {reviews.description}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {reviews.items.map((item: any) => (
            <article
              key={item.id}
              className="flex min-h-[300px] flex-col justify-between border border-white/10 bg-[#1c1c21] p-6"
            >
              <blockquote className="text-xl font-semibold italic leading-9 text-white/86">
                «{item.text}»
              </blockquote>
              <div className="mt-8 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center bg-white/8 text-sm font-black uppercase text-white">
                    {item.author.slice(0, 2).replace("@", "")}
                  </div>
                  <div>
                    <div className="font-black">{item.author}</div>
                    {item.location ? (
                      <div className="text-sm text-white/45">
                        {item.location}
                      </div>
                    ) : null}
                  </div>
                </div>
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-sm font-bold uppercase tracking-[0.16em] text-[var(--fd-accent-decor)] hover:text-[var(--fd-accent-decor-hover)]"
                  >
                    Оригинал на {item.source}
                  </a>
                ) : (
                  <div className="text-sm font-bold uppercase tracking-[0.16em] text-white/38">
                    {item.source}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function AboutPage() {
  const [publicSettings, setPublicSettings] = useState(() => getCachedPublicSettings());
  const { about, reviews } = useMemo(
    () => parseHomeTrustSettings(publicSettings),
    [publicSettings],
  );

  useEffect(() => {
    let mounted = true;

    fetchPublicSettings({ force: true }).then((settings) => {
      if (mounted) {
        setPublicSettings(settings);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-black text-white selection:bg-white selection:text-black">
      <PageSeo
        title="О нас"
        description="О Fashion Demon: информация о магазине, условиях покупки и реальные отзывы покупателей."
        canonicalPath="/about"
        keywords={ABOUT_KEYWORDS}
      />
      <Header />

      <main className="pt-16 lg:pt-20">
        <AboutDetailsSection about={about} />
        <AboutReviewsSection reviews={reviews} />
      </main>

      <Suspense fallback={<FooterPlaceholder />}>
        <Footer />
      </Suspense>
    </div>
  );
}
