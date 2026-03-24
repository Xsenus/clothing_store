import { Button } from "@/components/ui/button";
import {
  getHomeNewProducts,
  getHomePopularProducts,
} from "@/lib/home-api";
import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router";

const ProductCard = lazy(() => import("@/components/ProductCard"));

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  isNew?: boolean;
  likesCount?: number;
}

interface HomeProductSectionProps {
  title: string;
  linkTo: string;
  fetchMode: "new" | "popular";
  dark?: boolean;
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

export default function HomeProductSection({
  title,
  linkTo,
  fetchMode,
  dark = false,
}: HomeProductSectionProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadProducts = async () => {
      try {
        const response =
          fetchMode === "new"
            ? await getHomeNewProducts()
            : await getHomePopularProducts();

        if (mounted && Array.isArray(response)) {
          setProducts(response.slice(0, 4));
        }
      } catch (error) {
        console.error("Failed to fetch home products:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadProducts();
    return () => {
      mounted = false;
    };
  }, [fetchMode]);

  const linkClassName = dark
    ? "hidden border-b-2 border-white pb-1 text-sm font-bold uppercase tracking-widest transition-colors hover:border-gray-300 hover:text-gray-300 md:block"
    : "hidden border-b-2 border-black pb-1 text-sm font-bold uppercase tracking-widest transition-colors hover:border-gray-600 hover:text-gray-600 md:block";
  const buttonClassName = dark
    ? "w-full rounded-none border-white py-6 font-bold uppercase tracking-widest text-white hover:bg-white hover:text-black"
    : "w-full rounded-none border-black py-6 font-bold uppercase tracking-widest text-black hover:bg-black hover:text-white";

  return (
    <>
      <div className="mb-12 flex items-end justify-between">
        <h2 className="text-4xl font-black uppercase tracking-tighter md:text-6xl">
          {title}
        </h2>
        <Link to={linkTo} className={linkClassName}>
          Все
        </Link>
      </div>

      {isLoading ? (
        <ProductGridPlaceholder />
      ) : (
        <Suspense fallback={<ProductGridPlaceholder />}>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                allowQuickAdd={false}
              />
            ))}
          </div>
        </Suspense>
      )}

      <div className="mt-12 text-center md:hidden">
        <Link to={linkTo}>
          <Button variant="outline" className={buttonClassName}>
            Все
          </Button>
        </Link>
      </div>
    </>
  );
}
