import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import { Button } from '@/components/ui/button';
import { FLOW } from '@/lib/api-mapping';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import LoadingSpinner from '@/components/LoadingSpinner';

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  isNew?: boolean;
  likesCount?: number;
}

export default function HomePage() {
  const handleScrollToNew = () => {
    const section = document.getElementById("new-arrivals");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [newRes, popularRes] = await Promise.all([
          FLOW.getNewProducts({ input: {} }),
          FLOW.getPopularProducts({ input: {} })
        ]);
        
        if (Array.isArray(newRes)) setNewProducts(newRes.slice(0, 4));
        if (Array.isArray(popularRes)) setPopularProducts(popularRes.slice(0, 4));
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
            FASHION<br/>DEMON
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

      {/* New Arrivals */}
      <section id="new-arrivals" className="py-24 bg-white text-black">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-12">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase">НОВИНКИ</h2>
            <Link to="/catalog?sort=new" className="text-sm font-bold uppercase tracking-widest border-b-2 border-black pb-1 hover:text-gray-600 hover:border-gray-600 transition-colors hidden md:block">
              ВСЕ
            </Link>
          </div>
          
          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {newProducts.map((product) => (
                <ProductCard key={product._id} product={product} allowQuickAdd={false} />
              ))}
            </div>
          )}
          
          <div className="mt-12 text-center md:hidden">
            <Link to="/catalog?sort=new">
              <Button variant="outline" className="w-full border-black text-black hover:bg-black hover:text-white uppercase font-bold tracking-widest rounded-none py-6">
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
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase text-white">В ТРЕНДЕ</h2>
            <Link to="/catalog?sort=popular" className="text-sm font-bold uppercase tracking-widest border-b-2 border-white pb-1 hover:text-gray-300 hover:border-gray-300 transition-colors hidden md:block">
              ВСЕ
            </Link>
          </div>
          
          {loading ? (
            <LoadingSpinner className="text-white" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {popularProducts.map((product) => (
                <ProductCard key={product._id} product={product} allowQuickAdd={false} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
