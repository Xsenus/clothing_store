import { Button } from '@/components/ui/button';
import QuantitySelector from '@/components/QuantitySelector';
import { useCart } from '@/context/CartContext';
import { formatProductPrice } from '@/lib/price-format';
import { Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface Product {
  _id: string;
  name: string;
  price: number;
  images: string[];
  slug: string;
}

interface CartItem {
  cartId: string;
  productId: string;
  size: string;
  quantity: number;
}

interface CartItemCardProps {
  item: CartItem;
  product?: Product;
  isOutOfStock?: boolean;
  availableStock?: number | null;
}

export default function CartItemCard({ item, product, isOutOfStock = false, availableStock = null }: CartItemCardProps) {
  const { updateQuantity, removeFromCart } = useCart();
  const [updating, setUpdating] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleQuantityChange = async (val: number) => {
    setUpdating(true);
    await updateQuantity(item.cartId, val);
    setUpdating(false);
  };

  const handleRemove = async () => {
    setUpdating(true);
    await removeFromCart(item.cartId);
    setUpdating(false);
  };

  if (!product) return (
    <div className="flex items-center justify-between p-4 border-b animate-pulse">
      <div className="h-20 w-20 bg-gray-200 rounded" />
      <div className="space-y-2 flex-1 px-4">
        <div className="h-4 bg-gray-200 w-1/2 rounded" />
        <div className="h-4 bg-gray-200 w-1/4 rounded" />
      </div>
    </div>
  );

  return (
    <div className="flex gap-4 py-6 border-b border-gray-100 last:border-0">
      <div className="h-24 w-24 flex-shrink-0 bg-gray-100 border border-gray-200 overflow-hidden relative">
        {product.images?.[0] && !imgError ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white text-xs text-center p-1">
            {product.name}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start">
            <h3 className="font-bold uppercase tracking-wide text-sm md:text-base">{product.name}</h3>
            <span className="font-black text-lg">{formatProductPrice(product.price * item.quantity)}</span>
          </div>
          <p className="text-sm text-gray-500 uppercase tracking-wider mt-1">Размер: {item.size}</p>
          <p className="text-xs text-gray-400 mt-1">{formatProductPrice(product.price)} / шт</p>
          {isOutOfStock && (
            <p className="text-xs text-red-600 mt-1 font-semibold">
              {availableStock === 0 ? "Товар закончился" : `Доступно: ${availableStock ?? 0} шт.`}
            </p>
          )}
        </div>

        <div className="flex justify-between items-center mt-4">
          <QuantitySelector
            quantity={item.quantity}
            onChange={handleQuantityChange}
            min={1}
            max={isOutOfStock ? item.quantity : Math.max(1, availableStock ?? 10)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            disabled={updating}
          >
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span className="sr-only">Удалить</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
