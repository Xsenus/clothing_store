import Header from "@/components/Header";
import DeferredSection from "@/components/home/DeferredSection";
import PageSeo from "@/components/PageSeo";
import { Button } from "@/components/ui/button";
import { Suspense, lazy } from "react";

const Footer = lazy(() => import("@/components/Footer"));
const HomeCollectionSliderSection = lazy(
  () => import("@/components/home/HomeCollectionSliderSection"),
);
const HomeProductSection = lazy(
  () => import("@/components/home/HomeProductSection"),
);

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

export default function HomePage() {
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

      <section className="relative flex h-screen items-center justify-center overflow-hidden bg-black text-white">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
          <div className="h-full w-full animate-pulse bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-black to-black opacity-50" />
        </div>

        <div className="container relative z-10 mx-auto space-y-8 px-4 text-center animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <h1 className="mb-4 text-6xl font-black uppercase leading-none tracking-tighter md:text-8xl lg:text-9xl">
            FASHION
            <br />
            DEMON
          </h1>
          <p className="text-xl font-light uppercase tracking-widest text-gray-300 md:text-2xl">
            Уличная мода. Переосмыслена.
          </p>
          <div className="pt-8">
            <Button
              asChild
              size="lg"
              className="rounded-none bg-white px-12 py-8 text-lg font-bold uppercase tracking-widest text-black transition-all hover:scale-105 hover:bg-gray-200"
            >
              <a href="#new-arrivals">В магазин</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-white py-20 text-black">
        <div className="container mx-auto px-4">
          <DeferredSection
            placeholder={<CollectionSliderPlaceholder />}
            rootMargin="360px 0px"
            idleTimeout={1500}
          >
            <Suspense fallback={<CollectionSliderPlaceholder />}>
              <HomeCollectionSliderSection />
            </Suspense>
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
            <Suspense fallback={<ProductGridPlaceholder />}>
              <HomeProductSection
                title="Новинки"
                linkTo="/catalog?sort=new"
                fetchMode="new"
              />
            </Suspense>
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
            <Suspense fallback={<ProductGridPlaceholder dark />}>
              <HomeProductSection
                title="В тренде"
                linkTo="/catalog?sort=popular"
                fetchMode="popular"
                dark
              />
            </Suspense>
          </DeferredSection>
        </div>
      </section>

      <DeferredSection
        placeholder={<FooterPlaceholder />}
        rootMargin="720px 0px"
        idleTimeout={2800}
      >
        <Suspense fallback={<FooterPlaceholder />}>
          <Footer />
        </Suspense>
      </DeferredSection>
    </div>
  );
}
