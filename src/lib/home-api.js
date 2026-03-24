import { apiRequest, toAbsoluteMediaUrl } from "@/lib/public-http";

const DEFAULT_COLLECTION_SLIDER = {
  enabled: true,
  title: "Коллекции",
  description: "",
  items: [],
};

const normalizeProduct = (product) => {
  if (!product) return product;
  const productId = product._id || product.id;
  const images = Array.isArray(product.images)
    ? product.images.map(toAbsoluteMediaUrl)
    : [];
  const media = Array.isArray(product.media)
    ? product.media.map((item) => ({
        ...item,
        url: toAbsoluteMediaUrl(item?.url),
      }))
    : [];

  return {
    ...product,
    _id: productId,
    id: productId,
    images,
    media,
    catalogImageUrl: toAbsoluteMediaUrl(product?.catalogImageUrl),
  };
};

const normalizeProducts = (products) =>
  Array.isArray(products) ? products.map(normalizeProduct) : [];

const normalizeCollectionSliderItem = (item) =>
  item && typeof item === "object"
    ? {
        ...item,
        imageUrl: toAbsoluteMediaUrl(item?.imageUrl),
        previewImages: Array.isArray(item?.previewImages)
          ? item.previewImages.map(toAbsoluteMediaUrl)
          : [],
      }
    : item;

export const getHomeNewProducts = async () =>
  normalizeProducts(await apiRequest("/products/new"));

export const getHomePopularProducts = async () =>
  normalizeProducts(await apiRequest("/products/popular"));

export const getHomeCollectionSlider = async () => {
  const payload = await apiRequest("/products/filters");
  const title =
    typeof payload?.collectionSlider?.title === "string" &&
    payload.collectionSlider.title.trim()
      ? payload.collectionSlider.title
      : DEFAULT_COLLECTION_SLIDER.title;

  return {
    enabled: payload?.collectionSlider?.enabled !== false,
    title,
    description:
      typeof payload?.collectionSlider?.description === "string"
        ? payload.collectionSlider.description
        : DEFAULT_COLLECTION_SLIDER.description,
    items: Array.isArray(payload?.collectionSlider?.items)
      ? payload.collectionSlider.items.map(normalizeCollectionSliderItem)
      : [],
  };
};
