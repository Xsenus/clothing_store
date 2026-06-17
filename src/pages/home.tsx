import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DeferredSection from "@/components/home/DeferredSection";
import HomeCollectionSliderSection from "@/components/home/HomeCollectionSliderSection";
import HomeProductSection from "@/components/home/HomeProductSection";
import PageSeo from "@/components/PageSeo";
import SafeRenderBoundary from "@/components/SafeRenderBoundary";
import { fetchPublicSettings, getCachedPublicSettings } from "@/lib/site-settings";
import { parseHomeTrustSettings } from "@/lib/home-trust-settings";
import { cn } from "@/lib/utils";
import {
  BadgeCheck,
  Flame,
  MessageSquareQuote,
  RefreshCcw,
  Shield,
  ShieldCheck,
  Shirt,
  Sparkles,
  Truck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";

const HOME_KEYWORDS = [
  "fashiondemon",
  "магазин одежды",
  "streetwear",
  "стритвир",
  "модная одежда",
  "брендовая одежда",
  "каталог одежды",
];

function ProductGridPlaceholder({ dark = false }: { dark?: boolean }) {
  const cardClassName = dark
    ? "overflow-hidden border border-white/15 bg-neutral-950"
    : "overflow-hidden border border-black/10 bg-white";
  const mediaClassName = dark
    ? "aspect-square bg-white/6"
    : "aspect-square bg-stone-100";
  const titleSkeletonClassName = dark
    ? "h-6 w-3/4 bg-white/10"
    : "h-6 w-3/4 bg-stone-100";
  const priceSkeletonClassName = dark
    ? "h-5 w-1/2 bg-white/10"
    : "h-5 w-1/2 bg-stone-100";

  return (
    <div
      className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className={cardClassName}>
          <div className={mediaClassName} />
          <div className="space-y-3 p-4">
            <div className={titleSkeletonClassName} />
            <div className={priceSkeletonClassName} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CollectionSliderPlaceholder() {
  return <div className="min-h-[320px] bg-stone-100" aria-hidden="true" />;
}

function FooterPlaceholder() {
  return <div className="min-h-[220px] bg-black" aria-hidden="true" />;
}

const iconMap = {
  flame: Flame,
  shirt: Shirt,
  truck: Truck,
  shield: Shield,
  sparkles: Sparkles,
  refresh: RefreshCcw,
  "badge-check": BadgeCheck,
  message: MessageSquareQuote,
};

const isExternalUrl = (url: string) => /^https?:\/\//i.test(url);

function TrustCtaLink({
  to,
  className,
  children,
}: {
  to: string;
  className: string;
  children: ReactNode;
}) {
  if (isExternalUrl(to)) {
    return (
      <a href={to} className={className} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return (
    <Link to={to || "/catalog"} className={className}>
      {children}
    </Link>
  );
}

const getHeroTitleLines = (title: string) => {
  const normalizedTitle = String(title || "").trim();
  const dashParts = normalizedTitle.split(/\s+-\s+/);
  if (dashParts.length === 2) {
    const tailWords = dashParts[1].trim().split(/\s+/).filter(Boolean);
    if (tailWords.length > 1) {
      return [`${dashParts[0]} - ${tailWords[0]}`, tailWords.slice(1).join(" ")];
    }
  }

  return [normalizedTitle];
};

function HomeHeroSection({ hero }: { hero: any }) {
  if (!hero.enabled) return null;

  const titleLines = getHeroTitleLines(hero.title);

  return (
    <section className="relative flex min-h-[calc(100svh-72px)] items-center overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0,transparent_34%,var(--fd-accent-hero-soft)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/10" />

      <div className="container relative z-10 mx-auto px-4 pb-16 pt-28 md:py-28">
        <div className="mx-auto max-w-5xl space-y-8 text-center">
          {hero.eyebrowEnabled && hero.eyebrow ? (
            <p className="text-sm font-black uppercase tracking-[0.42em] text-[var(--fd-accent-hero)]">
              {hero.eyebrow}
            </p>
          ) : null}
          <h1 className="mx-auto max-w-4xl break-words text-[2rem] font-black uppercase leading-[0.9] tracking-normal sm:text-6xl lg:text-8xl">
            {titleLines.map((line, index) => (
              <span key={line} className="block">
                {line}
                {index < titleLines.length - 1 ? " " : ""}
              </span>
            ))}
          </h1>
          <p className="mx-auto max-w-[22rem] text-lg font-medium leading-7 text-white/68 sm:max-w-2xl sm:text-xl sm:leading-8 md:text-2xl">
            {hero.subtitle}
          </p>
          <div className="mx-auto flex w-full max-w-[20rem] flex-col justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
            <TrustCtaLink
              to={hero.primaryCtaUrl}
              className="inline-flex min-h-14 w-full items-center justify-center bg-[var(--fd-accent-hero)] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-[var(--fd-accent-hero-hover)] sm:w-auto sm:px-8"
            >
              {hero.primaryCtaText}
            </TrustCtaLink>
            {hero.secondaryCtaEnabled && (
              <TrustCtaLink
                to={hero.secondaryCtaUrl}
                className="inline-flex min-h-14 w-full items-center justify-center border border-white/35 bg-transparent px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition-colors hover:border-white hover:bg-white hover:text-black sm:w-auto sm:px-8"
              >
                {hero.secondaryCtaText}
              </TrustCtaLink>
            )}
          </div>
          {hero.metaText && (
            <p className="mx-auto max-w-[18rem] text-xs font-semibold uppercase leading-6 tracking-[0.16em] text-white/48 sm:max-w-2xl sm:text-sm">
              {hero.metaText}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function HomeBenefitsSection({ benefits }: { benefits: any }) {
  if (!benefits.enabled || benefits.items.length === 0) return null;

  return (
    <section className="bg-[#111114] py-20 text-white sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mb-12 flex flex-col items-start gap-4 lg:items-center lg:text-center">
          <h2 className="max-w-3xl text-4xl font-black uppercase leading-none tracking-normal md:text-6xl lg:mx-auto">
            {benefits.title}
          </h2>
          <div className="h-1 w-24 bg-[var(--fd-accent-decor)]" aria-hidden="true" />
        </div>
        <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2 xl:grid-cols-4">
          {benefits.items.map((item: any, index: number) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap] || Sparkles;
            const layout = item.layout || (index % 3 === 1 ? "center" : index % 3 === 2 ? "right" : "left");
            const iconWrapperClassName = cn(
              "mb-8 flex lg:justify-center lg:text-center",
              layout === "center" && "justify-center text-center",
              layout === "right" && "justify-end text-right lg:justify-center lg:text-center",
              layout === "left" && "justify-start text-left lg:justify-center lg:text-center",
            );
            const contentClassName = cn(
              "lg:text-center",
              layout === "center" && "text-center",
              layout === "right" && "text-right lg:text-center",
            );
            return (
              <article key={item.id} className="min-h-[260px] bg-[#17171b] p-6 sm:p-8 lg:flex lg:flex-col lg:items-center lg:text-center">
                <div className={iconWrapperClassName}>
                  <Icon className="h-10 w-10 text-[var(--fd-accent-decor)]" strokeWidth={2.4} />
                </div>
                <div className={contentClassName}>
                  <h3 className="mb-4 text-2xl font-black uppercase leading-tight">
                    {item.title}
                  </h3>
                  <p className="text-base leading-7 text-white/58">{item.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HomeAboutSection({ about }: { about: any }) {
  if (!about.enabled) return null;

  return (
    <section id="about" className="scroll-mt-24 bg-black py-20 text-white sm:py-28">
      <div className="container mx-auto grid gap-12 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-6">
          <p className="text-sm font-black uppercase tracking-[0.36em] text-[var(--fd-accent-decor)]">
            {about.eyebrow}
          </p>
          <h2 className="text-4xl font-black uppercase leading-none tracking-normal md:text-6xl">
            {about.title}
          </h2>
          <p className="max-w-3xl text-lg leading-8 text-white/64">{about.text}</p>
        </div>
        {about.highlights.length > 0 && (
          <div className="space-y-3">
            {about.highlights.map((item: any, index: number) => (
              <article key={item.id} className="border border-white/12 bg-white/[0.04] p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center bg-[var(--fd-accent-decor)] text-sm font-black text-white">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-xl font-black uppercase">{item.title}</h3>
                </div>
                <p className="text-sm leading-6 text-white/58">{item.description}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HomeReviewsSection({ reviews }: { reviews: any }) {
  if (!reviews.enabled || reviews.items.length === 0) return null;

  return (
    <section id="reviews" className="scroll-mt-24 bg-[#111114] py-20 text-white sm:py-28">
      <div className="container mx-auto px-4">
        <div className="mb-12 max-w-3xl space-y-4">
          <p className="text-sm font-black uppercase tracking-[0.36em] text-[var(--fd-accent-decor)]">
            {reviews.sourceLabel}
          </p>
          <h2 className="text-4xl font-black uppercase leading-none tracking-normal md:text-6xl">
            {reviews.title}
          </h2>
          {reviews.description && (
            <p className="text-lg leading-8 text-white/58">{reviews.description}</p>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {reviews.items.map((item: any) => (
            <article key={item.id} className="flex min-h-[300px] flex-col justify-between border border-white/10 bg-[#1c1c21] p-6">
              <blockquote className="text-xl font-semibold italic leading-9 text-white/86">
                “{item.text}”
              </blockquote>
              <div className="mt-8 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center bg-white/8 text-sm font-black uppercase text-white">
                    {item.author.slice(0, 2).replace("@", "")}
                  </div>
                  <div>
                    <div className="font-black">{item.author}</div>
                    {item.location && <div className="text-sm text-white/45">{item.location}</div>}
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

export default function HomePage() {
  const location = useLocation();
  const [publicSettings, setPublicSettings] = useState(() => getCachedPublicSettings());
  const homeTrustSettings = useMemo(
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

  useEffect(() => {
    const currentHash = location.hash || window.location.hash;
    if (!currentHash) return;

    let cancelled = false;
    const targetId = decodeURIComponent(currentHash.slice(1));
    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
    const scrollToHashTarget = (behavior: ScrollBehavior) => {
      const element = document.getElementById(targetId);
      if (!cancelled && element) {
        const targetTop = element.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, targetTop), left: 0, behavior });
      }
    };

    window.requestAnimationFrame(() => {
      scrollToHashTarget("smooth");
    });

    const retryDelays = isMobileViewport
      ? [120, 320, 620, 1000]
      : [120, 320, 620];
    const retryTimeoutIds = retryDelays.map((delay) =>
      window.setTimeout(() => {
        scrollToHashTarget("auto");
      }, delay),
    );

    return () => {
      cancelled = true;
      retryTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [location.hash, location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-black selection:text-white">
      <PageSeo
        description="fashiondemon - магазин одежды и стритвира: новые коллекции, популярные модели и доставка по России."
        canonicalPath="/"
        keywords={HOME_KEYWORDS}
        structuredData={({ canonicalUrl, imageUrl, siteTitle }) => [
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: siteTitle,
            url: canonicalUrl,
            logo: imageUrl,
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteTitle,
            url: canonicalUrl,
            inLanguage: "ru-RU",
          },
        ]}
      />
      <Header />

      <HomeHeroSection hero={homeTrustSettings.hero} />
      <HomeBenefitsSection benefits={homeTrustSettings.benefits} />

      <section className="bg-white py-20 text-black">
        <div className="container mx-auto px-4">
          <DeferredSection
            placeholder={<CollectionSliderPlaceholder />}
            rootMargin="360px 0px"
            idleTimeout={1500}
          >
            <SafeRenderBoundary
              source="home-collection-slider"
              fallback={<CollectionSliderPlaceholder />}
            >
              <HomeCollectionSliderSection />
            </SafeRenderBoundary>
          </DeferredSection>
        </div>
      </section>

      <section id="new-arrivals" className="bg-white py-24 text-black">
        <div className="container mx-auto px-4">
          <DeferredSection
            placeholder={<ProductGridPlaceholder />}
            rootMargin="520px 0px"
            idleTimeout={2100}
          >
            <SafeRenderBoundary
              source="home-new-products"
              fallback={<ProductGridPlaceholder />}
            >
              <HomeProductSection
                title="Новинки"
                linkTo="/catalog?sort=new"
                fetchMode="new"
              />
            </SafeRenderBoundary>
          </DeferredSection>
        </div>
      </section>

      <section className="bg-black py-24 text-white">
        <div className="container mx-auto px-4">
          <DeferredSection
            placeholder={<ProductGridPlaceholder dark />}
            rootMargin="520px 0px"
            idleTimeout={2400}
          >
            <SafeRenderBoundary
              source="home-popular-products"
              fallback={<ProductGridPlaceholder dark />}
            >
              <HomeProductSection
                title="В тренде"
                linkTo="/catalog?sort=popular"
                fetchMode="popular"
                dark
                centerTitleOnMobile
              />
            </SafeRenderBoundary>
          </DeferredSection>
        </div>
      </section>

      <HomeAboutSection about={homeTrustSettings.about} />
      <HomeReviewsSection reviews={homeTrustSettings.reviews} />

      <DeferredSection
        placeholder={<FooterPlaceholder />}
        rootMargin="720px 0px"
        idleTimeout={2800}
      >
        <SafeRenderBoundary source="home-footer" fallback={<FooterPlaceholder />}>
          <Footer />
        </SafeRenderBoundary>
      </DeferredSection>
    </div>
  );
}
