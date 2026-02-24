import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CartItemCard from '@/components/CartItemCard';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { Link } from 'react-router';
import { FLOW } from '@/lib/api-mapping';
import { useEffect, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
}

export default function CartPage() {
  const { cartItems, isLoading, clearCart } = useCart();
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [fetchingProducts, setFetchingProducts] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const allProducts = await FLOW.getAllProducts({ input: {} });
        if (Array.isArray(allProducts)) {
          const productMap: Record<string, Product> = {};
          allProducts.forEach((p: any) => {
            productMap[p._id] = p;
          });
          setProducts(productMap);
        }
      } catch (error) {
        console.error("Failed to fetch products for cart:", error);
      } finally {
        setFetchingProducts(false);
      }
    };

    fetchProducts();
  }, []);

  const subtotal = cartItems.reduce((sum, item) => {
    const product = products[item.productId];
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  if (isLoading || fetchingProducts) return <LoadingSpinner className="h-screen" />;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12">
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-12 text-center md:text-left">
          ВАША КОРЗИНА
        </h1>

        {cartItems.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 border border-dashed border-gray-300">
            <h2 className="text-2xl font-bold uppercase mb-4">Ваша корзина пуста</h2>
            <p className="text-gray-500 mb-8">Похоже, вы еще ничего не добавили.</p>
            <Link to="/catalog">
              <Button size="lg" className="uppercase font-bold tracking-widest px-8">
                НАЧАТЬ ПОКУПКИ
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Cart Items List */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex justify-between items-center border-b pb-4">
                <span className="font-bold uppercase tracking-widest text-sm text-gray-500">
                  {cartItems.length} Товаров
                </span>
                <Button 
                  variant="link" 
                  className="text-red-500 hover:text-red-700 font-bold uppercase text-xs"
                  onClick={() => clearCart()}
                >
                  Очистить корзину
                </Button>
              </div>

              <div className="space-y-0">
                {cartItems.map((item) => (
                  <CartItemCard 
                    key={item.cartId} 
                    item={item} 
                    product={products[item.productId]} 
                  />
                ))}
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-gray-50 p-8 border border-gray-200 sticky top-24">
                <h3 className="text-xl font-black uppercase tracking-tighter mb-6">ИТОГО ПО ЗАКАЗУ</h3>
                
                <div className="space-y-4 mb-8">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 uppercase tracking-wide">Промежуточный итог</span>
                    <span className="font-bold">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 uppercase tracking-wide">Доставка</span>
                    <span className="text-gray-400 italic">Рассчитывается при оформлении</span>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6 mb-8">
                  <div className="flex justify-between items-end">
                    <span className="font-black uppercase tracking-widest">ИТОГО</span>
                    <span className="text-3xl font-black">${subtotal.toFixed(2)}</span>
                  </div>
                </div>

                <Link to="/checkout" className="block w-full">
                  <Button className="w-full py-6 text-lg font-black uppercase tracking-widest bg-black hover:bg-gray-800 text-white transition-all hover:scale-[1.02]">
                    ОФОРМИТЬ ЗАКАЗ
                  </Button>
                </Link>
                
                <p className="text-xs text-center text-gray-400 mt-4 uppercase tracking-widest">
                  Безопасная оплата
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}