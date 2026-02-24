import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import SizeSelector from '@/components/SizeSelector';
import QuantitySelector from '@/components/QuantitySelector';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FLOW } from '@/lib/api-mapping';
import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { useCart } from '@/context/CartContext';
import { toast } from 'sonner';
import { Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface Product {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  images: string[];
  videos?: string[];
  media?: { type: "image" | "video"; url: string }[];
  sizes: string[];
  category: string;
  isNew?: boolean;
  likesCount?: number;
  sku?: string;
  material?: string;
  printType?: string;
  fit?: string;
  gender?: string;
  color?: string;
  shipping?: string;
  reviews?: { id?: string; author: string; date: string; text: string; media?: string[] }[];
  commentsCount?: number;
  sizeStock?: Record<string, number>;
}

export default function ProductDetailPage() {
  const { slug } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [imgError, setImgError] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMedia, setReviewMedia] = useState<string[]>([]);
  const [mediaIndex, setMediaIndex] = useState(0);
  
  const { addToCart } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!slug) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const productRes = await FLOW.getSingleProduct({ input: { slug } });
        if (productRes) {
          setProduct(productRes);
          setMediaIndex(0);
          // Reset selection
          setSelectedSize('');
          setQuantity(1);
          setImgError(false);

          // Fetch similar
          if (productRes.category) {
            const similarRes = await FLOW.getSimilarProducts({ 
              input: { category: productRes.category, productId: productRes._id } 
            });
            if (Array.isArray(similarRes)) {
              setSimilarProducts(similarRes);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch product:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [slug]);

  const mediaItems = product
    ? (product.media && product.media.length > 0
        ? product.media
        : [
            ...(product.images || []).map((url) => ({ type: "image" as const, url })),
            ...(product.videos || []).map((url) => ({ type: "video" as const, url })),
          ])
    : [];
  const currentMedia = mediaItems[mediaIndex];
  const goPrev = () => {
    if (mediaItems.length === 0) return;
    setMediaIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length);
    setImgError(false);
  };
  const goNext = () => {
    if (mediaItems.length === 0) return;
    setMediaIndex((prev) => (prev + 1) % mediaItems.length);
    setImgError(false);
  };

  useEffect(() => {
    if (!product || !selectedSize) return;
    const available = product.sizeStock?.[selectedSize];
    if (available !== undefined) {
      setQuantity((prev) => Math.min(prev, Math.max(1, available)));
    }
  }, [selectedSize, product]);

  useEffect(() => {
    if (!product || !isAuthenticated) {
      setIsLiked(false);
      return;
    }
    const checkUserLike = async () => {
      try {
        const result = await FLOW.checkLike({ input: { productId: product._id } });
        setIsLiked(!!result?.liked);
      } catch (e) {
        setIsLiked(false);
      }
    };
    checkUserLike();
  }, [product?._id, isAuthenticated]);

  const handleAddToCart = async () => {
    if (!product) return;
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }
    if (!selectedSize) {
      toast.error("Пожалуйста, выберите размер");
      return;
    }
    const available = product.sizeStock?.[selectedSize];
    if (available !== undefined && available <= 0) {
      toast.error("Размер закончился");
      return;
    }
    if (available !== undefined && quantity > available) {
      toast.error("Недостаточно товара на складе");
      return;
    }

    try {
      await addToCart(product._id, selectedSize, quantity);
      // Optional: Redirect or open cart drawer
    } catch (error) {
      // Handled in context
    }
  };

  const handleLike = async () => {
    if (!product) return;
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }
    try {
      const result = await FLOW.toggleLike({ input: { productId: product._id } });
      const nextLiked = !!result?.liked;
      setIsLiked(nextLiked);
      toast.success(nextLiked ? "Добавлено в избранное" : "Удалено из избранного");
      // Could re-fetch product to update likes count
    } catch (error) {
      toast.error("Пожалуйста, войдите");
    }
  };

  const handleAddReview = async () => {
    if (!product) return;
    if (!reviewText.trim()) {
      toast.error("Введите отзыв");
      return;
    }
    setReviewSubmitting(true);
    try {
      const review = await FLOW.addProductReview({
        input: {
          productId: product._id,
          text: reviewText.trim(),
          media: reviewMedia,
        },
      });
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              reviews: [review, ...(prev.reviews || [])],
            }
          : prev
      );
      setReviewText("");
      setReviewMedia([]);
    } catch (error) {
      toast.error("Не удалось добавить отзыв");
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner className="h-screen" />;
  
  if (!product) return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center">
        <h1 className="text-4xl font-black mb-4">ТОВАР НЕ НАЙДЕН</h1>
        <Link to="/catalog">
          <Button>Вернуться в каталог</Button>
        </Link>
      </div>
      <Footer />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-24">
          {/* Left: Images */}
          <div className="space-y-4">
            <div className="aspect-[3/4] bg-gray-100 overflow-hidden relative border border-gray-200">
              {currentMedia?.type === "video" ? (
                <video src={currentMedia.url} controls className="w-full h-full object-cover" />
              ) : currentMedia?.url && !imgError ? (
                <img 
                  src={currentMedia.url} 
                  alt={product.name} 
                  className="w-full h-full object-cover" 
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white font-bold text-2xl">
                  {product.name}
                </div>
              )}
              {product.isNew && (
                <Badge className="absolute top-4 left-4 bg-white text-black uppercase tracking-widest text-xs py-1 px-3">
                  НОВИНКА
                </Badge>
              )}
              {mediaItems.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 text-white flex items-center justify-center"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/60 text-white flex items-center justify-center"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
            
            {/* Thumbnails */}
            {mediaItems.length > 1 && (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {mediaItems.map((item, idx) => (
                  <button 
                    key={idx}
                    onClick={() => {
                      setMediaIndex(idx);
                      setImgError(false);
                    }}
                    className={`relative w-24 h-32 flex-shrink-0 border-2 transition-all ${
                      mediaIndex === idx ? 'border-black opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    {item.type === "video" ? (
                      <div className="w-full h-full flex items-center justify-center bg-black text-white text-xs uppercase font-bold">
                        Видео
                      </div>
                    ) : (
                      <img src={item.url} alt={`${product.name} ${idx}`} className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="space-y-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-2 leading-none">
                {product.name}
              </h1>
              <div className="text-xs uppercase tracking-widest text-gray-500">
                {product.reviews?.length || 0} отзывы {product.commentsCount || 0} комментарии
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold text-black">{formatPrice(product.price)}</span>
                  <span className="text-sm text-gray-400 line-through">
                    {formatPrice(Math.round(product.price * 1.2))}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={handleLike}>
                    <Heart className={`w-6 h-6 transition-all ${isLiked ? "fill-white stroke-white" : ""}`} />
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t border-b border-gray-100 py-6 space-y-6">
              <div>
                <label className="block text-sm font-bold uppercase tracking-widest mb-3">ВЫБЕРИТЕ РАЗМЕР</label>
                <SizeSelector 
                  sizes={product.sizes || []} 
                  selectedSize={selectedSize} 
                  onSelect={setSelectedSize}
                  sizeStock={product.sizeStock || {}}
                />
                {!selectedSize && <p className="text-red-500 text-xs mt-2 font-bold uppercase">Пожалуйста, выберите размер</p>}
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-widest mb-3">КОЛИЧЕСТВО</label>
                <QuantitySelector 
                  quantity={quantity} 
                  onChange={setQuantity}
                  max={selectedSize ? (product.sizeStock?.[selectedSize] ?? 10) : 10}
                />
              </div>
            </div>

            <Button 
              size="lg" 
              className="w-full py-8 text-xl font-black uppercase tracking-widest"
              onClick={handleAddToCart}
              disabled={selectedSize ? (product.sizeStock?.[selectedSize] ?? 1) <= 0 : false}
            >
              В КОРЗИНУ
            </Button>

            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                Если у вас остались вопросы по товару - вы можете обратиться к продавцу
              </div>
              <Button variant="outline" className="w-full uppercase font-bold tracking-widest">
                Написать продавцу
              </Button>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full uppercase font-bold tracking-widest">
                  Описание
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tighter">
                    Описание
                  </DialogTitle>
                </DialogHeader>
                <div className="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">
                  {product.description || "Описание отсутствует."}
                </div>
              </DialogContent>
            </Dialog>

            <div className="space-y-3 pt-4">
              <h3 className="text-lg font-bold uppercase tracking-widest">Характеристики</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="text-gray-500">Артикул</div>
                <div className="text-black">{product.sku || "-"}</div>
                <div className="text-gray-500">Материал</div>
                <div className="text-black">{product.material || "-"}</div>
                <div className="text-gray-500">Принт</div>
                <div className="text-black">{product.printType || "-"}</div>
                <div className="text-gray-500">Лекала</div>
                <div className="text-black">{product.fit || "-"}</div>
                <div className="text-gray-500">Пол</div>
                <div className="text-black">{product.gender || "-"}</div>
                <div className="text-gray-500">Цвет</div>
                <div className="text-black">{product.color || "-"}</div>
                <div className="text-gray-500">Отправка</div>
                <div className="text-black">{product.shipping || "-"}</div>
              </div>
            </div>
            
            <div className="space-y-4 pt-8 border-t">
              <h3 className="text-lg font-bold uppercase tracking-widest">Отзывы</h3>
              <div className="space-y-3">
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Ваш отзыв"
                  className="w-full border border-gray-300 px-3 py-2 text-sm min-h-[80px]"
                />
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center justify-center h-10 px-4 border border-black font-bold uppercase tracking-widest cursor-pointer">
                    Фото/Видео
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        try {
                        const formDataUpload = new FormData();
                        Array.from(files).forEach((file) => formDataUpload.append("files", file));
                        const res = await FLOW.uploadMedia({ input: formDataUpload });
                        const urls = res?.urls || [];
                        setReviewMedia((prev) => [...prev, ...urls]);
                        } catch (error) {
                          toast.error("Не удалось загрузить файлы");
                        }
                      }}
                    />
                  </label>
                  {reviewMedia.length > 0 && (
                    <div className="text-xs text-gray-500">{reviewMedia.length} файл(ов)</div>
                  )}
                </div>
                <Button onClick={handleAddReview} disabled={reviewSubmitting} className="uppercase font-bold tracking-widest">
                  {reviewSubmitting ? "Отправка..." : "Оставить отзыв"}
                </Button>
              </div>
              {product.reviews && product.reviews.length > 0 ? (
                <div className="space-y-6">
                  {product.reviews.map((review, index) => (
                    <div key={review.id || `${review.author}-${index}`} className="space-y-2">
                      <div className="text-sm font-bold">{review.author}</div>
                      <div className="text-xs text-gray-500">{review.date}</div>
                      <div className="text-sm text-gray-700">{review.text}</div>
                      {review.media && review.media.length > 0 && (
                        <div className="flex flex-wrap gap-3 pt-2">
                          {review.media.map((mediaUrl, idx) => (
                            mediaUrl.match(/\.(mp4|webm|mov)$/i) ? (
                              <video key={`${mediaUrl}-${idx}`} src={mediaUrl} controls className="w-40 border border-gray-200" />
                            ) : (
                              <img key={`${mediaUrl}-${idx}`} src={mediaUrl} alt="" className="w-24 h-24 object-cover border border-gray-200" />
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">Пока нет отзывов</div>
              )}
            </div>

            <div className="text-xs text-gray-400 uppercase tracking-widest pt-4">
              <p>Категория: {product.category}</p>
              <p>Артикул: {product.slug}</p>
            </div>
          </div>
        </div>

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <div className="space-y-8">
            <h2 className="text-3xl font-black uppercase tracking-tighter">ВАМ МОЖЕТ ПОНРАВИТЬСЯ</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {similarProducts.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

const formatPrice = (price: number) => `${Math.round(price)}₽`;
