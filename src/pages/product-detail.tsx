import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import SizeSelector from '@/components/SizeSelector';
import QuantitySelector from '@/components/QuantitySelector';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { FLOW } from '@/lib/api-mapping';
import { type ChangeEvent, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { useCart } from '@/context/CartContext';
import { toast } from 'sonner';
import { Heart, ChevronLeft, ChevronRight, EyeOff, Loader2, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import PageSeo from '@/components/PageSeo';
import { resolveUrl, truncateText } from '@/lib/seo';
import { useProductMediaBackground } from '@/hooks/useProductMediaBackground';
import { getProductDetailImageDisplayClasses, getProductDetailMediaPageLayoutClasses } from '@/lib/product-card-background';
import { optimizeFilesForUpload } from '@/lib/image-upload-optimization';
import { fetchPublicSettings, getCachedPublicSettings } from '@/lib/site-settings';
import { formatProductPrice } from '@/lib/price-format';

interface ProductReview {
  id: string;
  productId?: string;
  userId?: string;
  author: string;
  text: string;
  media: string[];
  createdAt: number;
  editedAt?: number | null;
  isHidden?: boolean;
  hiddenAt?: number | null;
  isDeleted?: boolean;
  deletedAt?: number | null;
  deletedByRole?: string | null;
  isMine?: boolean;
}

interface ProductReviewsPayload {
  reviewsEnabled: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ProductReview[];
  myReview?: ProductReview | null;
}

interface ProductCollectionGroup {
  name: string;
  slug?: string | null;
  description?: string | null;
  color?: string | null;
  products: Product[];
}

interface Product {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  images: string[];
  catalogImageUrl?: string;
  videos?: string[];
  media?: { type: "image" | "video"; url: string }[];
  sizes: string[];
  category?: string;
  categories?: string[];
  collections?: string[];
  isNew?: boolean;
  likesCount?: number;
  sku?: string;
  material?: string;
  materials?: string[];
  printType?: string;
  fit?: string;
  gender?: string;
  color?: string;
  colors?: string[];
  shipping?: string;
  reviewsEnabled?: boolean;
  commentsCount?: number;
  sizeStock?: Record<string, number>;
}

const normalizeProductValues = (values?: string[] | null, fallback?: string | null) => {
  const result: string[] = [];
  const seen = new Set<string>();

  (values || []).forEach((value) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  });

  const fallbackValue = fallback?.trim();
  if (fallbackValue) {
    const fallbackKey = fallbackValue.toLowerCase();
    if (!seen.has(fallbackKey)) {
      result.unshift(fallbackValue);
    }
  }

  return result;
};

const formatReviewDate = (value?: number | null) => {
  if (!value) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
};

const isVideoReviewMedia = (url: string) => {
  const normalized = String(url || "")
    .split("#")[0]
    .split("?")[0]
    .toLowerCase();

  return [".mp4", ".webm", ".mov", ".m4v", ".avi", ".ogg"].some((extension) => normalized.endsWith(extension));
};

const getGenderLabel = (value?: string | null) => {
  switch (String(value || "").trim().toLowerCase()) {
    case "male":
      return "Мужской";
    case "female":
      return "Женский";
    case "unisex":
      return "Unisex";
    default:
      return String(value || "").trim();
  }
};

export default function ProductDetailPage() {
  const { slug } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [collectionGroups, setCollectionGroups] = useState<ProductCollectionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [reviewsData, setReviewsData] = useState<ProductReviewsPayload | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDeleteDialogOpen, setReviewDeleteDialogOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewDeleting, setReviewDeleting] = useState(false);
  const [reviewUploading, setReviewUploading] = useState(false);
  const [reviewMedia, setReviewMedia] = useState<string[]>([]);
  const [mediaIndex, setMediaIndex] = useState(0);
  
  const { addToCart } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const mediaImage = product?.media?.find((item) => item.type === "image")?.url || "";
  const productImage = product?.images?.[0] || mediaImage || "/favicon.ico";
  const productDescription = product
    ? truncateText(product.description || `${product.name} от fashiondemon`, 160)
    : "Страница товара fashiondemon.";
  const productCategories = product ? normalizeProductValues(product.categories, product.category) : [];
  const productCollections = product ? normalizeProductValues(product.collections) : [];
  const productMaterials = product ? normalizeProductValues(product.materials, product.material) : [];
  const productColors = product ? normalizeProductValues(product.colors, product.color) : [];
  const productCharacteristics = product
    ? [
        { label: "Артикул", value: product.sku?.trim() || "" },
        { label: "Материал", value: productMaterials.join(", ").trim() },
        { label: "Принт", value: product.printType?.trim() || "" },
        { label: "Лекала", value: product.fit?.trim() || "" },
        { label: "Пол", value: getGenderLabel(product.gender) },
        { label: "Цвет", value: productColors.join(", ").trim() },
        { label: "Отправка", value: product.shipping?.trim() || "" },
      ].filter((item) => item.value)
    : [];
  const hasSizeStockInfo = Boolean(product?.sizeStock && Object.keys(product.sizeStock).length > 0);
  const hasStock = product
    ? product.sizeStock
      ? Object.values(product.sizeStock).some((value) => Number(value) > 0)
      : (product.sizes || []).length > 0
    : false;
  const productImages = product
    ? (product.images?.length
        ? product.images
        : (product.media || [])
            .filter((item) => item.type === "image")
            .map((item) => item.url))
        .map((item) => resolveUrl(item))
        .filter(Boolean)
    : [];
  const seoTitle = product ? product.name : (loading ? "Товар" : "Товар не найден");
  const seoPath = slug ? `/product/${slug}` : "/catalog";
  const seoRobots = product ? "index,follow" : "noindex,nofollow";
  const reviewsEnabled = reviewsData?.reviewsEnabled ?? product?.reviewsEnabled ?? true;
  const myReview = reviewsData?.myReview || null;
  const hasOwnActiveReview = Boolean(myReview && !myReview.isDeleted);
  const canRestoreOwnReview = Boolean(myReview?.isDeleted && myReview.deletedByRole === "user" && reviewsEnabled);
  const canOpenReviewDialog = Boolean(
    isAuthenticated
    && (hasOwnActiveReview || (reviewsEnabled && (!myReview || canRestoreOwnReview)))
  );
  const reviewDialogTitle = hasOwnActiveReview
    ? "Редактировать отзыв"
    : canRestoreOwnReview
      ? "Оставить отзыв снова"
      : "Оставить отзыв";
  const reviewSubmitLabel = hasOwnActiveReview
    ? "Сохранить изменения"
    : canRestoreOwnReview
      ? "Восстановить отзыв"
      : "Оставить отзыв";
  const reviewPageNumbers = Array.from({ length: reviewsData?.totalPages || 0 }, (_, index) => index + 1);

  useEffect(() => {
    if (!slug) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const productRes = await FLOW.getSingleProduct({ input: { slug } });
        if (productRes) {
          setProduct(productRes);
          setMediaIndex(0);
          setReviewsPage(1);
          setReviewsData(null);
          setCollectionGroups([]);
          setSimilarProducts([]);
          setReviewDialogOpen(false);
          setReviewDeleteDialogOpen(false);
          setReviewText("");
          setReviewMedia([]);
          // Reset selection
          setSelectedSize('');
          setQuantity(0);
          setImgError(false);

          const [collectionGroupsRes, similarRes] = await Promise.all([
            Array.isArray(productRes.collections) && productRes.collections.length > 0
              ? FLOW.getProductCollectionGroups({ input: { slug } })
              : Promise.resolve([]),
            productRes.category
              ? FLOW.getSimilarProducts({
                input: { category: productRes.category, productId: productRes._id }
              })
              : Promise.resolve([]),
          ]);

          if (Array.isArray(collectionGroupsRes)) {
            setCollectionGroups(collectionGroupsRes);
          }

          if (Array.isArray(similarRes)) {
            setSimilarProducts(similarRes);
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

  const fetchReviews = async (productId: string, page: number) => {
    setReviewsLoading(true);
    try {
      const response = await FLOW.getProductReviews({
        input: {
          productId,
          page,
          pageSize: 10,
        },
      });

      setReviewsData(response);
      if (response?.page && response.page !== reviewsPage) {
        setReviewsPage(response.page);
      }

      return response;
    } catch (error) {
      toast.error("Не удалось загрузить отзывы");
      return null;
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    if (!product?._id) return;

    void fetchReviews(product._id, reviewsPage);
  }, [product?._id, reviewsPage, isAuthenticated]);

  const mediaItems = product
    ? (product.media && product.media.length > 0
        ? product.media
        : [
            ...(product.images || []).map((url) => ({ type: "image" as const, url })),
            ...(product.videos || []).map((url) => ({ type: "video" as const, url })),
          ])
    : [];
  const currentMedia = mediaItems[mediaIndex];
  const currentMediaImage =
    currentMedia?.type === "image"
      ? currentMedia.url
      : product?.images?.[0] || mediaImage || "";
  const {
    productDetailBackgroundMode,
    productDetailBackgroundStyle,
    productDetailStaticBackgroundStyle,
    productDetailImageFitMode,
    productDetailMediaSizeMode,
  } = useProductMediaBackground(currentMediaImage);
  const productDetailMediaLayout = getProductDetailMediaPageLayoutClasses(productDetailMediaSizeMode);
  const productDetailMediaDisplay = getProductDetailImageDisplayClasses(productDetailImageFitMode);
  const productDetailThumbnailPaddingClassName =
    productDetailImageFitMode === "fill" || productDetailImageFitMode === "cover" ? "" : "p-2";
  const selectedSizeAvailableQuantity = selectedSize
    ? hasSizeStockInfo
      ? Math.max(0, Number(product?.sizeStock?.[selectedSize] ?? 0))
      : 10
    : 0;
  const displayedQuantity = selectedSize ? quantity : 0;
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
    if (!product) return;

    if (!selectedSize) {
      setQuantity(0);
      return;
    }

    if (hasSizeStockInfo) {
      const available = Math.max(0, Number(product.sizeStock?.[selectedSize] ?? 0));
      setQuantity((prev) => {
        if (available <= 0) return 0;
        const nextBase = prev > 0 ? prev : 1;
        return Math.min(nextBase, available);
      });
      return;
    }

    setQuantity((prev) => (prev > 0 ? prev : 1));
  }, [selectedSize, product, hasSizeStockInfo]);

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
    if (quantity <= 0) {
      toast.error("Товар недоступен в выбранном размере");
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

  const legacyHandleAddReview = async () => {
    if (!product) return;
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }
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

  void legacyHandleAddReview;

  const openReviewEditor = () => {
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }

    if (!canOpenReviewDialog) return;

    const sourceReview = myReview && myReview.deletedByRole !== "admin" ? myReview : null;
    setReviewText(sourceReview?.text || "");
    setReviewMedia(sourceReview?.media || []);
    setReviewDialogOpen(true);
  };

  const handleReviewMediaUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setReviewUploading(true);
    try {
      const cachedUploadSettings = getCachedPublicSettings();
      const uploadSettings = Object.keys(cachedUploadSettings).length > 0
        ? cachedUploadSettings
        : await fetchPublicSettings();
      const preparedFiles = await optimizeFilesForUpload(Array.from(files), uploadSettings, "review_media");
      const formDataUpload = new FormData();
      preparedFiles.forEach((file) => formDataUpload.append("files", file));
      const result = await FLOW.uploadMedia({ input: formDataUpload });
      const uploadedUrls = Array.isArray(result?.urls) ? result.urls : [];
      if (uploadedUrls.length === 0) {
        throw new Error("Не удалось получить URL загруженных файлов");
      }
      setReviewMedia((prev) => Array.from(new Set([...prev, ...uploadedUrls])));
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось загрузить фото или видео"));
    } finally {
      setReviewUploading(false);
      event.target.value = "";
    }
  };

  const handleRemoveReviewMedia = (mediaUrl: string) => {
    setReviewMedia((prev) => prev.filter((item) => item !== mediaUrl));
  };

  const handleAddReview = async () => {
    if (!product) return;
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }
    if (!reviewText.trim()) {
      toast.error("Введите отзыв");
      return;
    }

    setReviewSubmitting(true);
    try {
      await FLOW.addProductReview({
        input: {
          productId: product._id,
          text: reviewText.trim(),
          media: reviewMedia,
        },
      });
      setReviewDialogOpen(false);
      setReviewsPage(1);
      await fetchReviews(product._id, 1);
      toast.success(hasOwnActiveReview ? "Отзыв обновлен" : "Отзыв сохранен");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Не удалось сохранить отзыв";
      toast.error(message);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!product || !myReview || myReview.isDeleted) return;

    setReviewDeleting(true);
    try {
      await FLOW.deleteOwnProductReview({ input: { productId: product._id } });
      setReviewDeleteDialogOpen(false);
      setReviewDialogOpen(false);
      setReviewsPage(1);
      await fetchReviews(product._id, 1);
      toast.success("Отзыв удален");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Не удалось удалить отзыв";
      toast.error(message);
    } finally {
      setReviewDeleting(false);
    }
  };

  if (loading) return (
    <>
      <PageSeo
        title={seoTitle}
        description={productDescription}
        canonicalPath={seoPath}
        image={productImage}
        robots={seoRobots}
      />
      <LoadingSpinner className="h-screen" />
    </>
  );
  
  if (!product) return (
    <>
      <PageSeo
        title="Товар не найден"
        description="Запрошенный товар не найден в каталоге fashiondemon."
        canonicalPath={seoPath}
        image={productImage}
        robots="noindex,nofollow"
      />
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
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <PageSeo
        title={seoTitle}
        description={productDescription}
        canonicalPath={seoPath}
        image={productImage}
        type="product"
        robots={seoRobots}
        keywords={[product.name, ...productCategories, product.sku, 'fashiondemon', 'купить одежду'].filter(Boolean)}
        structuredData={({ canonicalUrl, siteTitle }) => ({
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: productDescription,
          image: productImages.length > 0 ? productImages : [resolveUrl(productImage)],
          sku: product.sku || product.slug,
          category: productCategories.join(", ") || undefined,
          color: productColors.join(", ") || undefined,
          material: productMaterials.join(", ") || undefined,
          brand: {
            "@type": "Brand",
            name: siteTitle,
          },
          offers: {
            "@type": "Offer",
            url: canonicalUrl,
            priceCurrency: "RUB",
            price: String(Math.round(product.price)),
            availability: hasStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
          },
        })}
      />
      <Header />
      
      <main className="flex-1 container mx-auto px-4 pt-28 pb-12 md:pt-32">
        <div className="grid grid-cols-1 gap-12 mb-24 lg:grid-cols-2 lg:items-start">
          {/* Left: Images */}
          <div className={`space-y-4 lg:flex lg:flex-col ${productDetailMediaLayout.columnHeightClassName} lg:space-y-3`}>
            <div className={`relative aspect-[3/4] overflow-hidden border border-gray-200 lg:flex-1 lg:min-h-0 lg:aspect-auto ${productDetailMediaLayout.framePaddingClassName}`} style={productDetailBackgroundStyle}>
              {currentMedia?.type === "video" ? (
                <video src={currentMedia.url} controls className={`relative z-[1] h-full w-full ${productDetailMediaDisplay.objectFitClassName} ${productDetailMediaDisplay.scaleClassName} ${productDetailMediaLayout.mediaPaddingClassName}`.trim()} />
              ) : currentMedia?.url && !imgError ? (
                <img 
                  src={currentMedia.url} 
                  alt={product.name} 
                  className={`relative z-[1] h-full w-full ${productDetailMediaDisplay.objectFitClassName} ${productDetailMediaDisplay.scaleClassName} ${productDetailMediaLayout.mediaPaddingClassName}`.trim()} 
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className={`relative z-[1] flex h-full w-full items-center justify-center bg-gray-900 text-white font-bold text-2xl ${productDetailMediaLayout.mediaPaddingClassName}`}>
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
                    className="absolute left-3 top-1/2 z-[3] -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-3 top-1/2 z-[3] -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
            
            {/* Thumbnails */}
            {mediaItems.length > 1 && (
              <div className={productDetailMediaLayout.thumbnailsContainerClassName}>
                {mediaItems.map((item, idx) => (
                  <button 
                    key={idx}
                    onClick={() => {
                      setMediaIndex(idx);
                      setImgError(false);
                    }}
                    className={`${productDetailMediaLayout.thumbnailClassName} ${
                      mediaIndex === idx ? 'border-black opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    style={productDetailBackgroundMode === "auto" ? productDetailStaticBackgroundStyle : productDetailBackgroundStyle}
                  >
                    {item.type === "video" ? (
                      <div className="w-full h-full flex items-center justify-center bg-black text-white text-xs uppercase font-bold">
                        Видео
                      </div>
                    ) : (
                      <img
                        src={item.url}
                        alt={`${product.name} ${idx}`}
                        className={`h-full w-full ${productDetailMediaDisplay.objectFitClassName} ${productDetailMediaDisplay.thumbnailScaleClassName} ${productDetailThumbnailPaddingClassName}`.trim()}
                      />
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
                {reviewsData?.total || 0} отзывов {product.commentsCount || 0} комментариев
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold text-black">{formatProductPrice(product.price)}</span>
                  <span className="text-sm text-gray-400 line-through">
                    {formatProductPrice(product.price * 1.2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLike}
                    className="rounded-full border border-gray-200 text-black transition-colors hover:bg-red-50 hover:text-red-500"
                    aria-label={isLiked ? "Убрать из избранного" : "Добавить в избранное"}
                  >
                    <Heart className={`h-6 w-6 transition-colors ${isLiked ? "fill-red-500 stroke-red-500 text-red-500" : "stroke-black text-black"}`} />
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t border-b border-gray-100 py-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
                <div className="min-w-0 flex-1">
                  <label className="mb-3 block text-sm font-bold uppercase tracking-widest">ВЫБЕРИТЕ РАЗМЕР</label>
                  <SizeSelector 
                    sizes={product.sizes || []} 
                    selectedSize={selectedSize} 
                    onSelect={setSelectedSize}
                    sizeStock={product.sizeStock || {}}
                  />
                  {!selectedSize && <p className="mt-2 text-xs font-bold uppercase text-red-500">Пожалуйста, выберите размер</p>}
                </div>

                <div className="lg:min-w-[220px] lg:pt-0.5 lg:text-right">
                  <label className="mb-3 block text-sm font-bold uppercase tracking-widest">КОЛИЧЕСТВО</label>
                  <div className="flex lg:justify-end">
                    <QuantitySelector 
                      quantity={displayedQuantity}
                      min={selectedSize ? 1 : 0}
                      onChange={setQuantity}
                      max={selectedSize ? selectedSizeAvailableQuantity : 0}
                      disabled={!selectedSize || selectedSizeAvailableQuantity <= 0}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button 
              size="lg" 
              className="w-full py-8 text-xl font-black uppercase tracking-widest"
              onClick={handleAddToCart}
              disabled={!selectedSize || quantity <= 0}
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

            {productCharacteristics.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-lg font-bold uppercase tracking-widest">Характеристики</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {productCharacteristics.map((item) => (
                    <div key={item.label} className="contents">
                      <div className="text-gray-500">{item.label}</div>
                      <div className="text-black">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {productCollections.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-lg font-bold uppercase tracking-widest">Коллекции</h3>
                <div className="flex flex-wrap gap-2">
                  {productCollections.map((collection) => (
                    <Badge key={collection} variant="outline" className="rounded-none border-black px-3 py-2 text-xs font-bold uppercase tracking-widest">
                      {collection}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4 pt-8 border-t">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-bold uppercase tracking-widest">Отзывы</h3>
                {canOpenReviewDialog && (
                  <Button
                    type="button"
                    variant="outline"
                    className="uppercase font-bold tracking-widest"
                    onClick={openReviewEditor}
                  >
                    {hasOwnActiveReview ? (
                      <>
                        <Pencil className="mr-2 h-4 w-4" />
                        Редактировать отзыв
                      </>
                    ) : (
                      <>
                        <MessageSquarePlus className="mr-2 h-4 w-4" />
                        {canRestoreOwnReview ? "Оставить отзыв снова" : "Оставить отзыв"}
                      </>
                    )}
                  </Button>
                )}
              </div>

              {!isAuthenticated && (
                <div className="text-sm text-gray-500">Оставлять отзывы могут только авторизованные пользователи.</div>
              )}

              {isAuthenticated && !reviewsEnabled && !hasOwnActiveReview && !canRestoreOwnReview && (
                <div className="text-sm text-gray-500">Отзывы для этого товара отключены администратором.</div>
              )}

              {myReview && (
                <div className="space-y-3 border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-bold uppercase tracking-widest">Ваш отзыв</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>Создан: {formatReviewDate(myReview.createdAt)}</span>
                        {myReview.editedAt && <span>Изменен: {formatReviewDate(myReview.editedAt)}</span>}
                      </div>
                    </div>
                    {!myReview.isDeleted && (
                      <Button
                        type="button"
                        variant="outline"
                        className="uppercase font-bold tracking-widest"
                        onClick={() => setReviewDeleteDialogOpen(true)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить
                      </Button>
                    )}
                  </div>

                  {myReview.isDeleted ? (
                    <div className="text-sm text-gray-600">
                      {myReview.deletedByRole === "admin"
                        ? "Ваш отзыв удален администратором и больше не отображается на странице товара."
                        : "Вы удалили свой отзыв. Его можно оставить снова, пока отзывы для товара включены."}
                    </div>
                  ) : (
                    <>
                      {myReview.isHidden && (
                        <div className="flex items-start gap-2 text-sm text-gray-600">
                          <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>Отзыв скрыт администратором. Вы можете его отредактировать, но пока его не видят другие покупатели.</span>
                        </div>
                      )}
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">{myReview.text}</div>
                      {myReview.media && myReview.media.length > 0 && (
                        <div className="flex flex-wrap gap-3 pt-1">
                          {myReview.media.map((mediaUrl, index) => (
                            isVideoReviewMedia(mediaUrl) ? (
                              <video key={`${mediaUrl}-${index}`} src={mediaUrl} controls className="w-40 border border-gray-200" />
                            ) : (
                              <img key={`${mediaUrl}-${index}`} src={mediaUrl} alt="" className="h-24 w-24 object-cover border border-gray-200" />
                            )
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {isAuthenticated && !myReview && reviewsEnabled && (
                <div className="text-sm text-gray-500">
                  На этот товар можно оставить только один отзыв. Позже его можно отредактировать или удалить.
                </div>
              )}

              {reviewsLoading && !reviewsData ? (
                <div className="text-sm text-gray-500">Загружаем отзывы...</div>
              ) : reviewsData?.items && reviewsData.items.length > 0 ? (
                <div className="space-y-6">
                  {reviewsData.items.map((review) => (
                    <div key={review.id} className="space-y-2 border-b border-gray-100 pb-6 last:border-b-0 last:pb-0">
                      <div className="text-sm font-bold">{review.author}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>Создан: {formatReviewDate(review.createdAt)}</span>
                        {review.editedAt && <span>Изменен: {formatReviewDate(review.editedAt)}</span>}
                      </div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">{review.text}</div>
                      {review.media && review.media.length > 0 && (
                        <div className="flex flex-wrap gap-3 pt-2">
                          {review.media.map((mediaUrl, index) => (
                            isVideoReviewMedia(mediaUrl) ? (
                              <video key={`${mediaUrl}-${index}`} src={mediaUrl} controls className="w-40 border border-gray-200" />
                            ) : (
                              <img key={`${mediaUrl}-${index}`} src={mediaUrl} alt="" className="h-24 w-24 object-cover border border-gray-200" />
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  {reviewsLoading ? "Загружаем отзывы..." : "Пока нет отзывов"}
                </div>
              )}

              {reviewsData && reviewsData.totalPages > 1 && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReviewsPage((prev) => Math.max(1, prev - 1))}
                    disabled={reviewsPage <= 1 || reviewsLoading}
                  >
                    Назад
                  </Button>
                  {reviewPageNumbers.map((pageNumber) => (
                    <Button
                      key={pageNumber}
                      type="button"
                      size="sm"
                      variant={pageNumber === reviewsPage ? "default" : "outline"}
                      onClick={() => setReviewsPage(pageNumber)}
                      disabled={reviewsLoading}
                      className="min-w-10"
                    >
                      {pageNumber}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReviewsPage((prev) => Math.min(reviewsData.totalPages, prev + 1))}
                    disabled={reviewsPage >= reviewsData.totalPages || reviewsLoading}
                  >
                    Вперед
                  </Button>
                </div>
              )}
            </div>

            <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tighter">
                    {reviewDialogTitle}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <Textarea
                    value={reviewText}
                    onChange={(event) => setReviewText(event.target.value)}
                    placeholder="Поделитесь впечатлением о товаре"
                    className="min-h-[160px] rounded-none border-black"
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center justify-center border border-black px-4 py-2 font-bold uppercase tracking-widest">
                      Фото/Видео
                      <input
                        type="file"
                        accept="image/*,.avif,.jfif,video/*"
                        multiple
                        className="hidden"
                        onChange={handleReviewMediaUpload}
                      />
                    </label>
                    <div className="text-xs text-gray-500">
                      {reviewUploading ? "Загружаем файлы..." : `${reviewMedia.length} файл(ов) выбрано`}
                    </div>
                  </div>

                  {reviewMedia.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {reviewMedia.map((mediaUrl, index) => (
                        <div key={`${mediaUrl}-${index}`} className="relative">
                          {isVideoReviewMedia(mediaUrl) ? (
                            <video src={mediaUrl} controls className="h-24 w-24 border border-gray-200 object-cover" />
                          ) : (
                            <img src={mediaUrl} alt="" className="h-24 w-24 border border-gray-200 object-cover" />
                          )}
                          <button
                            type="button"
                            className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black text-white"
                            onClick={() => handleRemoveReviewMedia(mediaUrl)}
                            aria-label="Удалить вложение"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {myReview?.isHidden && !myReview.isDeleted && (
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>После сохранения отзыв останется скрытым, пока администратор не вернет его в публикацию.</span>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-between">
                  {hasOwnActiveReview ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="uppercase font-bold tracking-widest"
                      onClick={() => setReviewDeleteDialogOpen(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Удалить отзыв
                    </Button>
                  ) : (
                    <div />
                  )}
                  <Button
                    type="button"
                    className="uppercase font-bold tracking-widest"
                    onClick={handleAddReview}
                    disabled={reviewSubmitting || reviewUploading}
                  >
                    {reviewSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {reviewSubmitLabel}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog open={reviewDeleteDialogOpen} onOpenChange={setReviewDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить отзыв?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Отзыв исчезнет со страницы товара, но останется в системе как удаленный. Это действие нужно подтвердить.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteReview} disabled={reviewDeleting}>
                    {reviewDeleting ? "Удаляем..." : "Удалить"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="text-xs text-gray-400 uppercase tracking-widest pt-4">
              <p>Категория: {productCategories.join(", ") || "-"}</p>
              <p>Артикул: {product.slug}</p>
            </div>
          </div>
        </div>

        {collectionGroups.length > 0 && (
          <div className="space-y-10 border-t pt-12">
            <div className="space-y-2">
              <h2 className="text-3xl font-black uppercase tracking-tighter">Коллекции</h2>
              <p className="text-sm text-gray-500">Другие товары, объединённые с этой моделью в одну коллекцию.</p>
            </div>

            <div className="space-y-10">
              {collectionGroups.map((group) => (
                <section key={group.slug || group.name} className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-3 w-3 shrink-0 border border-black"
                      style={{ backgroundColor: group.color || "#111111" }}
                    />
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold uppercase tracking-widest">{group.name}</h3>
                      {group.description && (
                        <p className="text-sm text-gray-500">{group.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
                    {group.products.map((groupProduct) => (
                      <ProductCard key={`${group.name}-${groupProduct._id}`} product={groupProduct} allowQuickAdd={false} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <div className="space-y-8">
            <h2 className="text-3xl font-black uppercase tracking-tighter">ВАМ МОЖЕТ ПОНРАВИТЬСЯ</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {similarProducts.map((p) => (
                <ProductCard key={p._id} product={p} allowQuickAdd={false} />
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

