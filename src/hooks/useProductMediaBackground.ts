import { useEffect, useState, type CSSProperties } from "react";
import { getCachedPublicSettings, SITE_BRANDING_UPDATED_EVENT } from "@/lib/site-settings";
import {
  buildProductCardBackgroundStyleFromColor,
  buildStandardProductCardBackgroundStyle,
  buildTransparentProductCardBackgroundStyle,
  getAdaptiveProductCardBackgroundStyle,
  normalizeProductCardBackgroundColor,
  normalizeProductCardBackgroundMode,
  normalizeProductCardImageFitMode,
  normalizeProductDetailBackgroundColor,
  normalizeProductDetailBackgroundMode,
  normalizeProductDetailImageFitMode,
  normalizeProductDetailMediaSizeMode,
} from "@/lib/product-card-background";

export function useProductMediaBackground(imageUrl?: string | null) {
  const [publicSettings, setPublicSettings] = useState<Record<string, string>>(() => getCachedPublicSettings());
  const [adaptiveBackgroundStyle, setAdaptiveBackgroundStyle] = useState<CSSProperties>(() => buildStandardProductCardBackgroundStyle());

  const productCardBackgroundMode = normalizeProductCardBackgroundMode(publicSettings.product_card_background_mode);
  const productCardBackgroundColor = normalizeProductCardBackgroundColor(publicSettings.product_card_background_color);
  const productCardImageFitMode = normalizeProductCardImageFitMode(publicSettings.product_card_image_fit_mode);
  const productDetailBackgroundMode = normalizeProductDetailBackgroundMode(publicSettings.product_detail_background_mode);
  const productDetailBackgroundColor = normalizeProductDetailBackgroundColor(publicSettings.product_detail_background_color);
  const productDetailImageFitMode = normalizeProductDetailImageFitMode(publicSettings.product_detail_image_fit_mode);
  const productDetailMediaSizeMode = normalizeProductDetailMediaSizeMode(publicSettings.product_detail_media_size_mode);
  const productCardStaticBackgroundStyle =
    productCardBackgroundMode === "none"
      ? buildTransparentProductCardBackgroundStyle()
      : productCardBackgroundMode === "color"
      ? buildProductCardBackgroundStyleFromColor(productCardBackgroundColor)
      : buildStandardProductCardBackgroundStyle();
  const productDetailStaticBackgroundStyle =
    productDetailBackgroundMode === "none"
      ? buildTransparentProductCardBackgroundStyle()
      : productDetailBackgroundMode === "color"
      ? buildProductCardBackgroundStyleFromColor(productDetailBackgroundColor)
      : buildStandardProductCardBackgroundStyle();

  useEffect(() => {
    const handleBrandingUpdate = (event: Event) => {
      const nextSettings = (event as CustomEvent<Record<string, string>>)?.detail || getCachedPublicSettings();
      setPublicSettings(nextSettings);
    };

    window.addEventListener(SITE_BRANDING_UPDATED_EVENT, handleBrandingUpdate);
    return () => window.removeEventListener(SITE_BRANDING_UPDATED_EVENT, handleBrandingUpdate);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (productCardBackgroundMode !== "auto" && productDetailBackgroundMode !== "auto") {
      setAdaptiveBackgroundStyle(buildStandardProductCardBackgroundStyle());
      return () => {
        cancelled = true;
      };
    }

    const applyAdaptiveBackground = async () => {
      const nextStyle = await getAdaptiveProductCardBackgroundStyle(imageUrl);
      if (!cancelled) setAdaptiveBackgroundStyle(nextStyle);
    };

    applyAdaptiveBackground();

    return () => {
      cancelled = true;
    };
  }, [imageUrl, productCardBackgroundMode, productDetailBackgroundMode]);

  return {
    backgroundMode: productCardBackgroundMode,
    imageFitMode: productCardImageFitMode,
    productDetailMediaSizeMode,
    backgroundStyle: productCardBackgroundMode === "auto" ? adaptiveBackgroundStyle : productCardStaticBackgroundStyle,
    staticBackgroundStyle: productCardStaticBackgroundStyle,
    productCardBackgroundMode,
    productCardBackgroundStyle:
      productCardBackgroundMode === "auto" ? adaptiveBackgroundStyle : productCardStaticBackgroundStyle,
    productCardStaticBackgroundStyle,
    productCardBackgroundColor,
    productCardImageFitMode,
    productDetailBackgroundMode,
    productDetailBackgroundStyle:
      productDetailBackgroundMode === "auto" ? adaptiveBackgroundStyle : productDetailStaticBackgroundStyle,
    productDetailStaticBackgroundStyle,
    productDetailBackgroundColor,
    productDetailImageFitMode,
  };
}
