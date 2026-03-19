import { useEffect, useState } from "react";
import { type CarouselApi, Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

export interface CatalogCollectionSliderItem {
  value: string;
  label: string;
  slug?: string | null;
  imageUrl?: string | null;
  previewMode?: "gallery" | "products";
  previewImages?: string[];
  description?: string | null;
  color?: string | null;
  productCount?: number;
}

interface CatalogCollectionsSliderProps {
  items: CatalogCollectionSliderItem[];
  activeValue?: string | null;
  onSelect: (item: CatalogCollectionSliderItem) => void;
  eyebrow?: string;
  title?: string;
  description?: string;
  className?: string;
}

const COLLECTION_VISIBLE_TILE_COUNT = 3;
const COLLECTION_PREVIEW_POOL_LIMIT = 18;
const COLLECTION_AUTOPLAY_DELAY_MS = 8000;

const hashCollectionValue = (value: string) =>
  Array.from(value || "").reduce((acc, char) => acc + char.charCodeAt(0), 0);

const getPreviewPool = (item: CatalogCollectionSliderItem) => {
  const tiles = (Array.isArray(item.previewImages) ? item.previewImages : [])
    .map((imageUrl) => String(imageUrl || "").trim())
    .filter(Boolean)
    .filter((imageUrl, index, list) => list.indexOf(imageUrl) === index);

  return tiles.slice(0, COLLECTION_PREVIEW_POOL_LIMIT);
};

const getPreviewTiles = (item: CatalogCollectionSliderItem, rotationTick: number) => {
  const previewPool = getPreviewPool(item);

  if (previewPool.length === 0) return [];

  if (previewPool.length <= COLLECTION_VISIBLE_TILE_COUNT) {
    const normalizedTiles = [...previewPool];
    while (normalizedTiles.length < COLLECTION_VISIBLE_TILE_COUNT) {
      normalizedTiles.push(normalizedTiles[normalizedTiles.length - 1]);
    }
    return normalizedTiles.slice(0, COLLECTION_VISIBLE_TILE_COUNT);
  }

  const startIndex = (hashCollectionValue(item.value) + rotationTick) % previewPool.length;
  const selectedTiles: string[] = [];

  for (let offset = 0; selectedTiles.length < COLLECTION_VISIBLE_TILE_COUNT && offset < previewPool.length; offset += 1) {
    selectedTiles.push(previewPool[(startIndex + offset) % previewPool.length]);
  }

  while (selectedTiles.length < COLLECTION_VISIBLE_TILE_COUNT) {
    selectedTiles.push(selectedTiles[selectedTiles.length - 1]);
  }

  return selectedTiles;
};

const renderCollectionVisual = (item: CatalogCollectionSliderItem, rotationTick: number) => {
  const previewTiles = getPreviewTiles(item, rotationTick);
  const shouldUseProductCollage = item.previewMode === "products" && previewTiles.length > 0;
  const imageUrl = item.imageUrl?.trim();

  if (shouldUseProductCollage) {
    return (
      <div className="absolute inset-0 grid grid-cols-3">
        {previewTiles.map((tile, index) => (
          <div key={`${item.value}-tile-${index}`} className="relative overflow-hidden border-r border-white/10 last:border-r-0">
            <img
              src={tile}
              alt=""
              className="h-full w-full object-cover transition duration-700 group-hover/slide:scale-105"
            />
          </div>
        ))}
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="absolute inset-0">
        <img
          src={imageUrl}
          alt={item.label}
          className="h-full w-full object-cover transition duration-700 group-hover/slide:scale-[1.03]"
        />
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: `linear-gradient(120deg, ${item.color?.trim() || "#202020"} 0%, #111111 52%, #2d2d2d 100%)`,
      }}
    />
  );
};

export default function CatalogCollectionsSlider({
  items,
  activeValue,
  onSelect,
  eyebrow,
  title,
  description,
  className,
}: CatalogCollectionsSliderProps) {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [rotationTick, setRotationTick] = useState(0);
  const [isAutoplayPaused, setIsAutoplayPaused] = useState(false);

  useEffect(() => {
    if (!carouselApi || items.length <= 1) {
      return;
    }

    const handleSelect = () => {
      setRotationTick((current) => current + 1);
    };

    carouselApi.on("select", handleSelect);
    return () => {
      carouselApi.off("select", handleSelect);
    };
  }, [carouselApi, items.length]);

  useEffect(() => {
    if (items.length === 0 || isAutoplayPaused) {
      return;
    }

    if (items.length > 1 && !carouselApi) {
      return;
    }

    const autoplayTimer = window.setInterval(() => {
      if (items.length > 1) {
        const snapCount = carouselApi?.scrollSnapList().length ?? 0;
        if (snapCount > 1) {
          const nextIndex = ((carouselApi?.selectedScrollSnap() ?? 0) + 1) % snapCount;
          carouselApi?.scrollTo(nextIndex);
        }
        return;
      }

      setRotationTick((current) => current + 1);
    }, COLLECTION_AUTOPLAY_DELAY_MS);

    return () => window.clearInterval(autoplayTimer);
  }, [carouselApi, isAutoplayPaused, items.length]);

  if (items.length === 0) {
    return null;
  }

  const normalizedEyebrow = eyebrow?.trim().toLowerCase();
  const normalizedTitle = title?.trim().toLowerCase();
  const shouldShowEyebrow = Boolean(eyebrow) && normalizedEyebrow !== normalizedTitle;

  return (
    <section
      className={cn("group space-y-4", className)}
      onMouseEnter={() => setIsAutoplayPaused(true)}
      onMouseLeave={() => setIsAutoplayPaused(false)}
    >
      {(eyebrow || title || description) && (
        <div className="max-w-3xl space-y-2">
          {shouldShowEyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h2 className="text-2xl font-black uppercase tracking-tight md:text-3xl">
              {title}
            </h2>
          ) : null}
          {description?.trim() ? (
            <p className="text-sm leading-6 text-muted-foreground md:text-base">
              {description}
            </p>
          ) : null}
        </div>
      )}

      <Carousel
        setApi={setCarouselApi}
        opts={{
          align: "start",
          loop: items.length > 1,
        }}
        className="group/carousel"
      >
        <CarouselContent className="ml-0">
          {items.map((item) => {
            const isActive = activeValue === item.value;
            return (
              <CarouselItem key={item.slug || item.value} className="basis-full pl-0">
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-pressed={isActive}
                  aria-label={`Открыть коллекцию ${item.label}`}
                  className={cn(
                    "group/slide relative block w-full overflow-hidden border text-left text-white",
                    "h-[260px] sm:h-[340px] lg:h-[520px]",
                    isActive ? "border-black shadow-[0_0_0_2px_rgba(0,0,0,1)]" : "border-black/12"
                  )}
                >
                  {renderCollectionVisual(item, rotationTick)}

                  <div className="absolute inset-0 bg-black/6 transition duration-500 ease-out md:group-hover/slide:bg-black/42 md:group-focus-visible/slide:bg-black/42" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.08)_52%,rgba(0,0,0,0.72)_100%)] opacity-90 transition duration-500 ease-out md:opacity-0 md:group-hover/slide:opacity-100 md:group-focus-visible/slide:opacity-100" />

                  <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-5 sm:px-8 sm:pb-8 lg:px-10 lg:pb-10">
                    <div className="overflow-hidden">
                      <div
                        className="max-w-[70%] translate-y-0 opacity-100 text-2xl font-black uppercase tracking-tight transition duration-500 ease-out sm:text-4xl lg:text-6xl md:translate-y-full md:opacity-0 md:group-hover/slide:translate-y-0 md:group-hover/slide:opacity-100 md:group-focus-visible/slide:translate-y-0 md:group-focus-visible/slide:opacity-100"
                        style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
                      >
                        {item.label}
                      </div>
                    </div>
                  </div>
                </button>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        {items.length > 1 ? (
          <>
            <CarouselPrevious className="left-4 top-1/2 z-20 h-11 w-11 -translate-y-1/2 rounded-full border border-black/12 bg-white/95 text-black shadow-[0_18px_40px_rgba(0,0,0,0.18)] transition duration-300 hover:scale-105 hover:bg-white disabled:opacity-45 disabled:hover:scale-100 md:left-6 md:h-14 md:w-14 [&>svg]:h-5 [&>svg]:w-5" />
            <CarouselNext className="right-4 top-1/2 z-20 h-11 w-11 -translate-y-1/2 rounded-full border border-black/12 bg-white/95 text-black shadow-[0_18px_40px_rgba(0,0,0,0.18)] transition duration-300 hover:scale-105 hover:bg-white disabled:opacity-45 disabled:hover:scale-100 md:right-6 md:h-14 md:w-14 [&>svg]:h-5 [&>svg]:w-5" />
          </>
        ) : null}
      </Carousel>
    </section>
  );
}
