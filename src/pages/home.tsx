import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  getCatalogFilters,
  getNewProducts,
  getPopularProducts,
} from "@/lib/api-mapping";
import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router";
import LoadingSpinner from "@/components/LoadingSpinner";
import PageSeo from "@/components/PageSeo";
import type { CatalogCollectionSliderItem } from "@/components/CatalogCollectionsSlider";

const ProductCard = lazy(() => import("@/components/ProductCard"));
const CatalogCollectionsSlider = lazy(
  () => import("@/components/CatalogCollectionsSlider"),
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

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  isNew?: boolean;
  likesCount?: number;
}

interface CollectionSliderState {
  enabled: boolean;
  title: string;
  description: string;
  items: CatalogCollectionSliderItem[];
}

const DEFAULT_COLLECTION_SLIDER: CollectionSliderState = {
  enabled: true,
  title: "Коллекции",
  description: "",
  items: [],
};

function DeferredSection({
  children,
  placeholder,
  rootMargin = "320px 0px",
}: {
  children: ReactNode;
  placeholder: ReactNode;
  rootMargin?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible || typeof window === "undefined" || !containerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return <div ref={containerRef}>{isVisible ? children : placeholder}</div>;
}

function ProductGridPlaceholder() {
  return (
    <div
      className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden border border-black/10 bg-white"
        >
          <div className="aspect-square bg-stone-100" />
          <div className="space-y-3 p-4">
            <div className="h-6 w-3/4 bg-stone-100" />
            <div className="h-5 w-1/2 bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const handleScrollToNew = () => {
    const section = document.getElementById("new-arrivals");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [collectionSlider, setCollectionSlider] =
    useState<CollectionSliderState>(DEFAULT_COLLECTION_SLIDER);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [newRes, popularRes, filtersRes] = await Promise.all([
          getNewProducts({ input: {} }),
          getPopularProducts({ input: {} }),
          getCatalogFilters(),
        ]);

        if (Array.isArray(newRes)) setNewProducts(newRes.slice(0, 4));
        if (Array.isArray(popularRes))
          setPopularProducts(popularRes.slice(0, 4));
        setCollectionSlider({
          enabled: filtersRes?.collectionSlider?.enabled !== false,
          title:
            typeof filtersRes?.collectionSlider?.title === "string" &&
            filtersRes.collectionSlider.title.trim()
              ? filtersRes.collectionSlider.title
              : DEFAULT_COLLECTION_SLIDER.title,
          description:
            typeof filtersRes?.collectionSlider?.description === "string"
              ? filtersRes.collectionSlider.description
              : DEFAULT_COLLECTION_SLIDER.description,
          items: Array.isArray(filtersRes?.collectionSlider?.items)
            ? filtersRes.collectionSlider.items
            : [],
        });
      } catch (error) {
        console.error("Failed to fetch products:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden bg-black text-white">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
          {/* Animated Background Placeholder */}
          <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-black to-black opacity-50 animate-pulse" />
        </div>

        <div className="container mx-auto px-4 relative z-10 text-center space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter uppercase mb-4 leading-none">
            FASHION
            <br />
            DEMON
          </h1>
          <p className="text-xl md:text-2xl font-light tracking-widest uppercase text-gray-300">
            Уличная мода. Переосмыслена.
          </p>
          <div className="pt-8">
            <Button
              size="lg"
              className="bg-white text-black hover:bg-gray-200 text-lg px-12 py-8 rounded-none font-bold tracking-widest uppercase transition-all hover:scale-105"
              onClick={handleScrollToNew}
            >
              В МАГАЗИН
            </Button>
          </div>
        </div>
      </section>

      {collectionSlider.enabled && collectionSlider.items.length > 0 && (
        <section className="bg-white py-20 text-black">
          <div className="container mx-auto px-4">
            {loading ? (
              <LoadingSpinner className="min-h-[320px]" />
            ) : (
              <DeferredSection
                placeholder={
                  <div
                    className="min-h-[320px] bg-stone-100"
                    aria-hidden="true"
                  />
                }
                rootMargin="240px 0px"
              >
                <Suspense
                  fallback={<LoadingSpinner className="min-h-[320px]" />}
                >
                  <CatalogCollectionsSlider
                    eyebrow="Коллекции"
                    title={collectionSlider.title}
                    description={collectionSlider.description}
                    items={collectionSlider.items}
                    onSelect={(item) =>
                      navigate(
                        `/catalog?collection=${encodeURIComponent(item.slug || item.value)}`,
                      )
                    }
                  />
                </Suspense>
              </DeferredSection>
            )}
          </div>
        </section>
      )}

      {/* New Arrivals */}
      <section id="new-arrivals" className="py-24 bg-white text-black">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-12">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase">
              НОВИНКИ
            </h2>
            <Link
              to="/catalog?sort=new"
              className="text-sm font-bold uppercase tracking-widest border-b-2 border-black pb-1 hover:text-gray-600 hover:border-gray-600 transition-colors hidden md:block"
            >
              ВСЕ
            </Link>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : (
            <DeferredSection placeholder={<ProductGridPlaceholder />}>
              <Suspense fallback={<ProductGridPlaceholder />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                  {newProducts.map((product) => (
                    <ProductCard
                      key={product._id}
                      product={product}
                      allowQuickAdd={false}
                    />
                  ))}
                </div>
              </Suspense>
            </DeferredSection>
          )}

          <div className="mt-12 text-center md:hidden">
            <Link to="/catalog?sort=new">
              <Button
                variant="outline"
                className="w-full border-black text-black hover:bg-black hover:text-white uppercase font-bold tracking-widest rounded-none py-6"
              >
                ВСЕ
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Trending Section */}
      <section className="py-24 bg-black text-white">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-12">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase text-white">
              В ТРЕНДЕ
            </h2>
            <Link
              to="/catalog?sort=popular"
              className="text-sm font-bold uppercase tracking-widest border-b-2 border-white pb-1 hover:text-gray-300 hover:border-gray-300 transition-colors hidden md:block"
            >
              ВСЕ
            </Link>
          </div>

          {loading ? (
            <LoadingSpinner className="text-white" />
          ) : (
            <DeferredSection placeholder={<ProductGridPlaceholder />}>
              <Suspense fallback={<ProductGridPlaceholder />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                  {popularProducts.map((product) => (
                    <ProductCard
                      key={product._id}
                      product={product}
                      allowQuickAdd={false}
                    />
                  ))}
                </div>
              </Suspense>
            </DeferredSection>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
