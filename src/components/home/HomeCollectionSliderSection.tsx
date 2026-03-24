import CatalogCollectionsSlider, {
  type CatalogCollectionSliderItem,
} from "@/components/CatalogCollectionsSlider";
import { getHomeCollectionSlider } from "@/lib/home-api";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

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

function CollectionSliderPlaceholder() {
  return <div className="min-h-[320px] bg-stone-100" aria-hidden="true" />;
}

export default function HomeCollectionSliderSection() {
  const navigate = useNavigate();
  const [collectionSlider, setCollectionSlider] =
    useState<CollectionSliderState>(DEFAULT_COLLECTION_SLIDER);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadCollectionSlider = async () => {
      try {
        const nextCollectionSlider = await getHomeCollectionSlider();

        if (mounted) {
          setCollectionSlider(nextCollectionSlider);
        }
      } catch (error) {
        console.error("Failed to fetch home collection slider:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadCollectionSlider();
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return <CollectionSliderPlaceholder />;
  }

  if (!collectionSlider.enabled || collectionSlider.items.length === 0) {
    return null;
  }

  return (
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
  );
}
