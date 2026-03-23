import { Link, useNavigate } from 'react-router';
import { Heart, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FLOW } from '@/lib/api-mapping';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useCart } from '@/context/CartContext';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useProductMediaBackground } from '@/hooks/useProductMediaBackground';
import { getProductCardImageDisplayClasses } from '@/lib/product-card-background';
import { formatProductPrice } from '@/lib/price-format';
import {
  getCachedProductLikeState,
  setCachedProductLikeState,
  subscribeProductLikeState,
} from '@/lib/product-like-state';

interface Product {
  _id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  catalogImageUrl?: string;
  isNew?: boolean;
  likesCount?: number;
  sizes?: string[];
  description?: string;
  category?: string;
  isPopular?: boolean;
  isHidden?: boolean;
  sizeStock?: Record<string, number>;
}

interface ProductCardProps {
  product: Product;
  allowQuickAdd?: boolean;
  initialLiked?: boolean;
  onLikeChange?: (liked: boolean, product: Product) => void;
}

const FlyingImage = ({ src, startRect, onComplete }: { src: string; startRect: DOMRect; onComplete: () => void }) => {
  const target = document.getElementById('cart-icon-target');

  if (!target) return null;
  const targetRect = target.getBoundingClientRect();

  return createPortal(
    <motion.img
      src={src}
      initial={{
        position: 'fixed',
        top: startRect.top,
        left: startRect.left,
        width: startRect.width,
        height: startRect.height,
        opacity: 1,
        zIndex: 9999,
        borderRadius: '0px',
      }}
      animate={{
        top: targetRect.top + 10,
        left: targetRect.left + 10,
        width: 30,
        height: 30,
        opacity: [1, 1, 0],
        borderRadius: '50%',
      }}
      transition={{
        duration: 0.8,
        ease: [0.4, 0.0, 0.2, 1],
        opacity: {
          times: [0, 0.75, 1],
          duration: 0.8,
        },
      }}
      onAnimationComplete={onComplete}
      className="object-cover pointer-events-none shadow-xl"
    />,
    document.body
  );
};

export default function ProductCard({
  product,
  allowQuickAdd = true,
  initialLiked,
  onLikeChange,
}: ProductCardProps) {
  const [isLiked, setIsLiked] = useState(Boolean(initialLiked));
  const [likesCount, setLikesCount] = useState(product.likesCount || 0);
  const [isAdding, setIsAdding] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [flyingImage, setFlyingImage] = useState<{ src: string; rect: DOMRect } | null>(null);
  const [imageError, setImageError] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const { addToCart } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const hasStockInfo = Boolean(product.sizeStock && Object.keys(product.sizeStock).length > 0);
  const hasAvailableStock = !hasStockInfo || Object.values(product.sizeStock || {}).some((value) => Number(value) > 0);
  const isHiddenProduct = product.isHidden === true;
  const isUnavailable = isHiddenProduct || !hasAvailableStock;
  const canOpenProduct = !isHiddenProduct && Boolean(product.slug);
  const productHref = canOpenProduct ? `/product/${product.slug}` : null;
  const productCardImage = product.catalogImageUrl || product.images[0] || "";
  const { backgroundStyle: productCardBackgroundStyle, imageFitMode } = useProductMediaBackground(productCardImage);
  const cardImageDisplay = getProductCardImageDisplayClasses(imageFitMode, 'card');
  const compactImageDisplay = getProductCardImageDisplayClasses(imageFitMode, 'compact');
  const cardHoverScaleClassName =
    imageFitMode === 'contain-zoom'
      ? 'group-hover:scale-[1.12]'
      : imageFitMode === 'fill'
        ? ''
        : 'group-hover:scale-105';

  useEffect(() => {
    const cachedLikeState = getCachedProductLikeState(product._id);
    if (typeof cachedLikeState?.liked === 'boolean') {
      setIsLiked(cachedLikeState.liked);
    }
    if (typeof cachedLikeState?.likesCount === 'number') {
      setLikesCount(cachedLikeState.likesCount);
    }

    return subscribeProductLikeState(product._id, (nextSnapshot) => {
      if (typeof nextSnapshot.liked === 'boolean') {
        setIsLiked(nextSnapshot.liked);
      }
      if (typeof nextSnapshot.likesCount === 'number') {
        setLikesCount(nextSnapshot.likesCount);
      }
    });
  }, [product._id]);

  useEffect(() => {
    const cachedLikeState = getCachedProductLikeState(product._id);
    if (typeof cachedLikeState?.likesCount === 'number') {
      setLikesCount(cachedLikeState.likesCount);
      return;
    }

    const nextLikesCount = Math.max(0, Number(product.likesCount || 0));
    setLikesCount(nextLikesCount);
    setCachedProductLikeState(product._id, { likesCount: nextLikesCount });
  }, [product._id, product.likesCount]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLiked(false);
      return;
    }

    const cachedLikeState = getCachedProductLikeState(product._id);
    if (typeof cachedLikeState?.liked === 'boolean') {
      setIsLiked(cachedLikeState.liked);
    }

    if (typeof initialLiked === 'boolean') {
      setIsLiked(initialLiked);
      setCachedProductLikeState(product._id, { liked: initialLiked });
      return;
    }

    const checkUserLike = async () => {
      try {
        const result = await FLOW.checkLike({ input: { productId: product._id } });
        setCachedProductLikeState(product._id, { liked: !!result?.liked });
      } catch {
        setCachedProductLikeState(product._id, { liked: false });
      }
    };

    void checkUserLike();
  }, [initialLiked, isAuthenticated, product._id]);

  const handleLike = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }

    try {
      const result = await FLOW.toggleLike({ input: { productId: product._id } });
      const nextLiked = !!result?.liked;
      const cachedLikeState = getCachedProductLikeState(product._id);
      const baseLikesCount = typeof result?.likesCount === 'number'
        ? result.likesCount
        : typeof cachedLikeState?.likesCount === 'number'
          ? cachedLikeState.likesCount
          : likesCount;
      const nextLikesCount = typeof result?.likesCount === 'number'
        ? Math.max(0, Number(result.likesCount))
        : Math.max(0, baseLikesCount + (nextLiked ? 1 : -1));

      setCachedProductLikeState(product._id, {
        liked: nextLiked,
        likesCount: nextLikesCount,
      });
      onLikeChange?.(nextLiked, product);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Не удалось обновить избранное';
      toast.error(message);
    }
  };

  const handleQuickAdd = async () => {
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }

    if (isUnavailable) {
      toast.error('Товар сейчас недоступен');
      return;
    }

    if (!selectedSize) {
      toast.error('Выберите размер');
      return;
    }

    setIsAdding(true);
    const success = await addToCart(product._id, selectedSize, 1);

    if (success) {
      if (imageRef.current && productCardImage) {
        setFlyingImage({
          src: productCardImage,
          rect: imageRef.current.getBoundingClientRect(),
        });
      }
      setShowQuickAdd(false);
      setSelectedSize(null);
    }

    setIsAdding(false);
  };

  const mediaContent = (
    <>
      {productCardImage && !imageError ? (
        <img
          ref={imageRef}
          src={productCardImage}
          alt={product.name}
          className={`relative z-[1] h-full w-full transition-transform duration-500 ${canOpenProduct ? cardHoverScaleClassName : ''} ${cardImageDisplay.objectFitClassName} ${cardImageDisplay.paddingClassName} ${cardImageDisplay.scaleClassName}`.trim()}
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="relative z-[1] flex h-full w-full items-center justify-center bg-gray-900 p-4 text-center font-bold text-xl text-white">
          {product.name}
        </div>
      )}

      <div className={`absolute inset-0 transition-colors duration-300 ${canOpenProduct ? 'bg-black/0 group-hover:bg-black/10' : 'bg-black/5'}`} />

      <div className="absolute top-2 left-2 flex flex-col gap-2">
        {product.isNew && (
          <Badge className="bg-white text-black hover:bg-white/90 uppercase tracking-widest text-[10px] py-1 px-2 border-none">
            Новинка
          </Badge>
        )}
        {isUnavailable && (
          <Badge className="bg-black text-white hover:bg-black uppercase tracking-widest text-[10px] py-1 px-2 border-none">
            Закончился
          </Badge>
        )}
      </div>

      {allowQuickAdd && !isUnavailable && (
        <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-10 pointer-events-none">
          <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
            <DialogTrigger asChild>
              <Button
                className="w-full bg-white text-black hover:bg-gray-200 font-bold tracking-widest uppercase pointer-events-auto shadow-lg"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!isAuthenticated) {
                    navigate('/auth');
                  }
                }}
              >
                В корзину
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Выберите размер</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md" style={productCardBackgroundStyle}>
                    {productCardImage ? (
                      <img
                        src={productCardImage}
                        alt={product.name}
                        className={`relative z-[1] h-full w-full ${compactImageDisplay.objectFitClassName} ${compactImageDisplay.paddingClassName} ${compactImageDisplay.scaleClassName}`.trim()}
                      />
                    ) : (
                      <div className="relative z-[1] flex h-full w-full items-center justify-center p-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {product.name}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold">{product.name}</h3>
                    <p className="text-muted-foreground">{formatProductPrice(product.price)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {product.sizes && product.sizes.length > 0 ? (
                    product.sizes.map((size) => {
                      const disabled = hasStockInfo && (product.sizeStock?.[size] ?? 0) <= 0;
                      return (
                        <Button
                          key={size}
                          variant={selectedSize === size ? 'default' : 'outline'}
                          onClick={() => setSelectedSize(size)}
                          disabled={disabled}
                          className={`font-bold ${disabled ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : ''} ${selectedSize === size ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                        >
                          {size}
                        </Button>
                      );
                    })
                  ) : (
                    <p className="col-span-4 text-center text-sm text-muted-foreground">Размеры не указаны</p>
                  )}
                </div>

                <Button
                  className="w-full mt-4"
                  onClick={handleQuickAdd}
                  disabled={!selectedSize || isAdding}
                >
                  {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Добавить в корзину
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </>
  );

  const infoContent = (
    <>
      <h3 className="font-bold text-lg truncate mb-1">{product.name}</h3>
      <div className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black text-black">{formatProductPrice(product.price)}</span>
          <span className="text-sm text-gray-400 line-through">
            {formatProductPrice(product.price * 1.2)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Heart className="w-3 h-3 fill-current" />
          <span>{likesCount}</span>
        </div>
      </div>
      {isUnavailable && (
        <div className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
          Товар закончился
        </div>
      )}
    </>
  );

  return (
    <>
      <div className={`group block relative overflow-hidden bg-card border transition-all duration-300 transform-gpu origin-center ${canOpenProduct ? 'border-transparent hover:border-border hover:scale-[0.99]' : 'border-black/10 opacity-90'}`}>
        {productHref ? (
          <Link to={productHref} className="block relative aspect-[25/24] overflow-hidden" style={productCardBackgroundStyle}>
            {mediaContent}
          </Link>
        ) : (
          <div className="block relative aspect-[25/24] overflow-hidden cursor-default" style={productCardBackgroundStyle}>
            {mediaContent}
          </div>
        )}

        <button
          onClick={handleLike}
          className="absolute top-2 right-2 z-10 rounded-full border border-black/10 bg-white/85 p-2 text-black shadow-sm backdrop-blur-sm transition-all hover:scale-105 hover:bg-white"
          aria-label={isLiked ? 'Убрать из избранного' : 'Добавить в избранное'}
        >
          <Heart
            className={`h-6 w-6 transition-colors ${isLiked ? 'fill-red-500 stroke-red-500 text-red-500' : 'stroke-black text-black'}`}
          />
        </button>

        {productHref ? (
          <Link to={productHref} className="block p-4 bg-white text-black">
            {infoContent}
          </Link>
        ) : (
          <div className="block p-4 bg-white text-black">
            {infoContent}
          </div>
        )}
      </div>

      {flyingImage && (
        <FlyingImage
          src={flyingImage.src}
          startRect={flyingImage.rect}
          onComplete={() => setFlyingImage(null)}
        />
      )}
    </>
  );
}
