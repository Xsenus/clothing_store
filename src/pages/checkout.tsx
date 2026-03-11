import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCart } from '@/context/CartContext';
import { FLOW } from '@/lib/api-mapping';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Authenticated } from '@/context/AuthContext';
import { toast } from 'sonner';
import PageSeo from '@/components/PageSeo';

export default function CheckoutPage() {
  const { cartItems, totalItems, clearCart } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [shipping, setShipping] = useState(10);
  const [shippingLoading, setShippingLoading] = useState(false);

  // Fetch product prices to calculate total (since cart items don't have price)
  const [products, setProducts] = useState<Record<string, any>>({});
  
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await FLOW.getAllProducts({ input: {} });
        if (Array.isArray(res)) {
          const map: Record<string, any> = {};
          res.forEach((p: any) => map[p._id] = p);
          setProducts(map);
        }
      } catch (e) {
        console.error("Failed to fetch products");
      }
    };
    fetchProducts();
  }, []);

  const subtotal = cartItems.reduce((sum, item) => {
    const product = products[item.productId];
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  const total = subtotal + shipping;


  useEffect(() => {
    const q = address.trim();
    if (q.length < 4) {
      setAddressSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await FLOW.dadataSuggestAddresses({ input: { query: q, count: 5 } });
        const suggestions = Array.isArray(res?.suggestions)
          ? res.suggestions.map((x: any) => x.unrestrictedValue || x.value).filter(Boolean)
          : [];
        setAddressSuggestions(suggestions);
      } catch {
        setAddressSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [address]);

  useEffect(() => {
    const run = async () => {
      if (!address || subtotal <= 0) {
        setShipping(10);
        return;
      }

      setShippingLoading(true);
      try {
        const res = await FLOW.yandexDeliveryCalculate({
          input: {
            toAddress: address,
            weightKg: Math.max(1, Number((totalItems * 0.3).toFixed(2))),
            declaredCost: subtotal,
          },
        });
        const value = Number(res?.estimatedCost);
        if (!Number.isNaN(value) && value > 0) {
          setShipping(value);
        }
      } catch {
        setShipping(10);
      } finally {
        setShippingLoading(false);
      }
    };

    run();
  }, [address, subtotal, totalItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) {
      toast.error("Ваша корзина пуста");
      return;
    }
    
    setLoading(true);

    try {
      // Simulate order creation since backend logic might be incomplete
      // But we call the action that clears cart and is labeled as create order
      await FLOW.createOrder({
        input: {
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          shippingAddress: address,
          paymentMethod,
          items: cartItems,
          totalAmount: total
        }
      });
      
      // Clear local cart context as well
      await clearCart();
      
      toast.success("Заказ успешно оформлен!");
      navigate("/profile");
    } catch (error) {
      console.error("Checkout failed:", error);
      toast.error("Не удалось оформить заказ. Попробуйте еще раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Authenticated>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <PageSeo
          title="Оформление заказа"
          description="Оформление заказа в магазине fashiondemon."
          canonicalPath="/checkout"
          robots="noindex,nofollow"
        />
        <Header />
        
        <main className="flex-1 container mx-auto px-4 py-12">
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-8">ОФОРМЛЕНИЕ ЗАКАЗА</h1>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Form */}
            <div>
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="space-y-4">
                  <h2 className="text-xl font-bold uppercase tracking-wider border-b pb-2">ИНФОРМАЦИЯ О ПОКУПАТЕЛЕ</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Полное имя</Label>
                      <Input 
                        id="name" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="rounded-none border-black focus-visible:ring-black"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input 
                        id="email" 
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="rounded-none border-black focus-visible:ring-black"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Телефон</Label>
                    <Input 
                      id="phone" 
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="rounded-none border-black focus-visible:ring-black"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold uppercase tracking-wider border-b pb-2">АДРЕС ДОСТАВКИ</h2>
                  <div className="space-y-2">
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                      className="rounded-none border-black focus-visible:ring-black"
                      placeholder="Начните вводить адрес"
                    />
                    {addressSuggestions.length > 0 && (
                      <div className="border border-gray-200 bg-white">
                        {addressSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                            onClick={() => {
                              setAddress(suggestion);
                              setAddressSuggestions([]);
                            }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-bold uppercase tracking-wider border-b pb-2">СПОСОБ ОПЛАТЫ</h2>
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                    <div className="flex items-center space-x-2 border p-4 rounded-none border-black">
                      <RadioGroupItem value="cod" id="cod" />
                      <Label htmlFor="cod" className="font-bold">Оплата при получении</Label>
                    </div>
                    <div className="flex items-center space-x-2 border p-4 rounded-none border-gray-200 opacity-50 cursor-not-allowed">
                      <RadioGroupItem value="card" id="card" disabled />
                      <Label htmlFor="card">Банковская карта (скоро)</Label>
                    </div>
                  </RadioGroup>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-16 text-xl font-black uppercase tracking-widest bg-black text-white hover:bg-gray-800 rounded-none transition-all"
                  disabled={loading}
                >
                  {loading ? "Обработка..." : `ОФОРМИТЬ ЗАКАЗ - $${total.toFixed(2)}`}
                </Button>
              </form>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 p-8 border border-gray-200 h-fit sticky top-24">
              <h3 className="text-xl font-black uppercase tracking-tighter mb-6">СВОДКА ЗАКАЗА</h3>
              
              <div className="space-y-4 mb-8">
                {cartItems.map((item) => {
                  const product = products[item.productId];
                  if (!product) return null;
                  return (
                    <div key={item.cartId} className="flex justify-between items-start text-sm">
                      <div>
                        <p className="font-bold">{product.name}</p>
                        <p className="text-gray-500 text-xs">Размер: {item.size} x {item.quantity}</p>
                      </div>
                      <span className="font-bold">${(product.price * item.quantity).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Промежуточный итог</span>
                  <span className="font-bold">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Доставка {shippingLoading ? "(расчет...)" : ""}</span>
                  <span className="font-bold">${shipping.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl font-black mt-4 pt-4 border-t border-black">
                  <span>ИТОГО</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </main>
        
        <Footer />
      </div>
    </Authenticated>
  );
}
