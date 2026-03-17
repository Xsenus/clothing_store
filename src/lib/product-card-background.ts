import type { CSSProperties } from "react";

export type ProductCardBackgroundMode = "standard" | "color" | "auto" | "none";
export type ProductCardImageFitMode = "contain" | "contain-zoom" | "cover" | "fill";
export type ProductDetailMediaSizeMode = "compact" | "standard" | "large";

export const DEFAULT_PRODUCT_CARD_BACKGROUND_MODE: ProductCardBackgroundMode = "standard";
export const DEFAULT_PRODUCT_CARD_BACKGROUND_COLOR = "#e9e3da";
export const DEFAULT_PRODUCT_CARD_IMAGE_FIT_MODE: ProductCardImageFitMode = "contain";
export const DEFAULT_PRODUCT_DETAIL_BACKGROUND_MODE: ProductCardBackgroundMode = DEFAULT_PRODUCT_CARD_BACKGROUND_MODE;
export const DEFAULT_PRODUCT_DETAIL_BACKGROUND_COLOR = DEFAULT_PRODUCT_CARD_BACKGROUND_COLOR;
export const DEFAULT_PRODUCT_DETAIL_IMAGE_FIT_MODE: ProductCardImageFitMode = DEFAULT_PRODUCT_CARD_IMAGE_FIT_MODE;
export const DEFAULT_PRODUCT_DETAIL_MEDIA_SIZE_MODE: ProductDetailMediaSizeMode = "compact";

const WHITE_RGB = { r: 255, g: 255, b: 255 };
const STUDIO_RGB = { r: 244, g: 239, b: 232 };
const adaptiveBackgroundCache = new Map<string, CSSProperties>();
const adaptiveBackgroundPromiseCache = new Map<string, Promise<CSSProperties>>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mixRgb = (
  first: { r: number; g: number; b: number },
  second: { r: number; g: number; b: number },
  ratio: number,
) => {
  const safeRatio = clamp(ratio, 0, 1);
  return {
    r: Math.round(first.r + (second.r - first.r) * safeRatio),
    g: Math.round(first.g + (second.g - first.g) * safeRatio),
    b: Math.round(first.b + (second.b - first.b) * safeRatio),
  };
};

const rgbToCss = (rgb: { r: number; g: number; b: number }) => `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
const rgbaToCss = (rgb: { r: number; g: number; b: number }, alpha: number) =>
  `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;

const normalizeHexColor = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) return `#${normalized.toLowerCase()}`;
  return null;
};

const hexToRgb = (value?: string | null) => {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;

  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

const buildGradientStyle = (baseRgb: { r: number; g: number; b: number }): CSSProperties => {
  const top = mixRgb(baseRgb, WHITE_RGB, 0.9);
  const bottom = mixRgb(baseRgb, STUDIO_RGB, 0.78);

  return {
    backgroundColor: rgbToCss(bottom),
    backgroundImage: `radial-gradient(circle at top, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.48) 38%, rgba(255,255,255,0) 64%), linear-gradient(180deg, ${rgbToCss(top)} 0%, ${rgbToCss(bottom)} 100%)`,
  };
};

const averageRgb = (colors: Array<{ r: number; g: number; b: number } | null | undefined>) => {
  const valid = colors.filter(Boolean) as Array<{ r: number; g: number; b: number }>;
  if (valid.length === 0) return null;

  const sum = valid.reduce(
    (acc, color) => ({
      r: acc.r + color.r,
      g: acc.g + color.g,
      b: acc.b + color.b,
    }),
    { r: 0, g: 0, b: 0 },
  );

  return {
    r: Math.round(sum.r / valid.length),
    g: Math.round(sum.g / valid.length),
    b: Math.round(sum.b / valid.length),
  };
};

const sampleRegionRgb = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
) => {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha < 64) continue;

      totalR += data[index];
      totalG += data[index + 1];
      totalB += data[index + 2];
      count += 1;
    }
  }

  if (count === 0) return null;

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  };
};

const buildAdaptiveGradientStyle = (
  baseRgb: { r: number; g: number; b: number },
  topRgb: { r: number; g: number; b: number },
  bottomRgb: { r: number; g: number; b: number },
) => {
  const liftedTopRgb = mixRgb(topRgb, WHITE_RGB, 0.18);
  const middleRgb = mixRgb(baseRgb, WHITE_RGB, 0.1);
  const groundedBottomRgb = mixRgb(bottomRgb, WHITE_RGB, 0.06);

  return {
    backgroundColor: rgbToCss(middleRgb),
    backgroundImage: `radial-gradient(circle at 50% 14%, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.24) 28%, rgba(255,255,255,0) 58%), linear-gradient(180deg, ${rgbToCss(
      liftedTopRgb,
    )} 0%, ${rgbToCss(
      middleRgb,
    )} 48%, ${rgbToCss(groundedBottomRgb)} 100%)`,
  } satisfies CSSProperties;
};

export const normalizeProductCardBackgroundMode = (value?: string | null): ProductCardBackgroundMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "color" || normalized === "auto" || normalized === "none") return normalized;
  return DEFAULT_PRODUCT_CARD_BACKGROUND_MODE;
};

export const normalizeProductCardBackgroundColor = (value?: string | null) =>
  normalizeHexColor(value) || DEFAULT_PRODUCT_CARD_BACKGROUND_COLOR;

export const normalizeProductDetailBackgroundMode = (value?: string | null): ProductCardBackgroundMode =>
  normalizeProductCardBackgroundMode(value);

export const normalizeProductDetailBackgroundColor = (value?: string | null) =>
  normalizeHexColor(value) || DEFAULT_PRODUCT_DETAIL_BACKGROUND_COLOR;

export const normalizeProductCardImageFitMode = (value?: string | null): ProductCardImageFitMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "contain-zoom" || normalized === "cover" || normalized === "fill") {
    return normalized;
  }
  return DEFAULT_PRODUCT_CARD_IMAGE_FIT_MODE;
};

export const normalizeProductDetailImageFitMode = (value?: string | null): ProductCardImageFitMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "contain-zoom" || normalized === "cover" || normalized === "fill") {
    return normalized;
  }
  return DEFAULT_PRODUCT_DETAIL_IMAGE_FIT_MODE;
};

export const normalizeProductDetailMediaSizeMode = (value?: string | null): ProductDetailMediaSizeMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "standard" || normalized === "large") {
    return normalized;
  }
  return DEFAULT_PRODUCT_DETAIL_MEDIA_SIZE_MODE;
};

export const buildStandardProductCardBackgroundStyle = (): CSSProperties => ({
  backgroundColor: "rgb(239, 233, 224)",
  backgroundImage:
    "radial-gradient(circle at top, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.5) 38%, rgba(255,255,255,0) 64%), linear-gradient(180deg, rgb(248, 245, 240) 0%, rgb(236, 231, 223) 100%)",
});

export const buildTransparentProductCardBackgroundStyle = (): CSSProperties => ({
  backgroundColor: "transparent",
  backgroundImage: "none",
});

export const buildProductCardBackgroundStyleFromColor = (color?: string | null): CSSProperties => {
  const rgb = hexToRgb(color);
  if (!rgb) return buildStandardProductCardBackgroundStyle();
  return buildGradientStyle(rgb);
};

export const getProductCardImageDisplayClasses = (
  mode: ProductCardImageFitMode,
  variant: "card" | "compact" = "card",
) => {
  const paddingClassName =
    mode === "cover" || mode === "fill"
      ? "p-0"
      : mode === "contain-zoom"
        ? variant === "card"
          ? "p-1"
          : "p-0"
        : variant === "card"
          ? "p-4"
          : "p-2";

  const objectFitClassName =
    mode === "cover" ? "object-cover" : mode === "fill" ? "object-fill" : "object-contain";

  const scaleClassName =
    mode === "contain-zoom"
      ? variant === "card"
        ? "scale-[1.08]"
        : "scale-[1.04]"
      : "";

  return {
    paddingClassName,
    objectFitClassName,
    scaleClassName,
  };
};

export const getProductDetailImageDisplayClasses = (mode: ProductCardImageFitMode) => ({
  objectFitClassName: mode === "cover" ? "object-cover" : mode === "fill" ? "object-fill" : "object-contain",
  scaleClassName: mode === "contain-zoom" ? "scale-[1.04]" : "",
  thumbnailScaleClassName: mode === "contain-zoom" ? "scale-[1.02]" : "",
});

export const getProductDetailMediaPageLayoutClasses = (mode: ProductDetailMediaSizeMode) => {
  if (mode === "large") {
    return {
      columnHeightClassName: "lg:h-[calc(100vh-10rem)]",
      framePaddingClassName: "p-4 lg:p-4 xl:p-5",
      mediaPaddingClassName: "p-4 md:p-5 lg:p-6 xl:p-7",
      thumbnailsContainerClassName: "flex gap-4 overflow-x-auto pb-2 lg:shrink-0 lg:gap-3 lg:pb-0",
      thumbnailClassName: "relative h-28 w-20 flex-shrink-0 overflow-hidden border-2 transition-all lg:h-28 lg:w-20 xl:h-32 xl:w-24",
    };
  }

  if (mode === "standard") {
    return {
      columnHeightClassName: "lg:h-[calc(100vh-12rem)]",
      framePaddingClassName: "p-4 lg:p-4 xl:p-5",
      mediaPaddingClassName: "p-5 md:p-7 lg:p-8 xl:p-10",
      thumbnailsContainerClassName: "flex gap-4 overflow-x-auto pb-2 lg:shrink-0 lg:gap-3 lg:pb-0",
      thumbnailClassName: "relative h-28 w-20 flex-shrink-0 overflow-hidden border-2 transition-all lg:h-24 lg:w-[4.5rem] xl:h-28 xl:w-20",
    };
  }

  return {
    columnHeightClassName: "lg:h-[calc(100vh-15rem)]",
    framePaddingClassName: "p-4 lg:p-3 xl:p-4",
    mediaPaddingClassName: "p-6 md:p-8 lg:p-10 xl:p-12",
    thumbnailsContainerClassName: "flex gap-3 overflow-x-auto pb-2 lg:shrink-0 lg:gap-2 lg:pb-0",
    thumbnailClassName: "relative h-24 w-[4.5rem] flex-shrink-0 overflow-hidden border-2 transition-all lg:h-20 lg:w-16 xl:h-24 xl:w-[4.5rem]",
  };
};

export const getProductDetailMediaPreviewLayoutClasses = (mode: ProductDetailMediaSizeMode) => {
  if (mode === "large") {
    return {
      panelHeightClassName: "h-[360px]",
      framePaddingClassName: "p-3",
      mediaPaddingClassName: "p-4",
      thumbnailClassName: "h-16 w-12",
    };
  }

  if (mode === "standard") {
    return {
      panelHeightClassName: "h-[320px]",
      framePaddingClassName: "p-3",
      mediaPaddingClassName: "p-5",
      thumbnailClassName: "h-14 w-11",
    };
  }

  return {
    panelHeightClassName: "h-[280px]",
    framePaddingClassName: "p-2.5",
    mediaPaddingClassName: "p-6",
    thumbnailClassName: "h-12 w-10",
  };
};

const loadImage = (imageUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for adaptive background"));
    image.src = imageUrl;
  });

const sampleDominantRgb = (data: Uint8ClampedArray, skipNearWhite: boolean) => {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < 120) continue;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];

    if (skipNearWhite && r > 245 && g > 245 && b > 245) continue;

    totalR += r;
    totalG += g;
    totalB += b;
    count += 1;
  }

  if (count === 0) return null;

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  };
};

const extractAdaptiveBackgroundStyle = async (imageUrl: string): Promise<CSSProperties> => {
  if (typeof document === "undefined" || !imageUrl.trim()) {
    return buildStandardProductCardBackgroundStyle();
  }

  try {
    const image = await loadImage(imageUrl.trim());
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) return buildStandardProductCardBackgroundStyle();

    const size = 32;
    canvas.width = size;
    canvas.height = size;
    context.drawImage(image, 0, 0, size, size);

    const { data } = context.getImageData(0, 0, size, size);
    const stripX = Math.max(3, Math.round(size * 0.12));
    const stripY = Math.max(3, Math.round(size * 0.12));
    const cornerX = Math.max(4, Math.round(size * 0.2));
    const cornerY = Math.max(4, Math.round(size * 0.2));

    const topLeftRgb = sampleRegionRgb(data, size, size, 0, cornerX, 0, cornerY);
    const topRightRgb = sampleRegionRgb(data, size, size, size - cornerX, size, 0, cornerY);
    const bottomLeftRgb = sampleRegionRgb(data, size, size, 0, cornerX, size - cornerY, size);
    const bottomRightRgb = sampleRegionRgb(data, size, size, size - cornerX, size, size - cornerY, size);
    const leftMiddleRgb = sampleRegionRgb(data, size, size, 0, stripX, cornerY, size - cornerY);
    const rightMiddleRgb = sampleRegionRgb(data, size, size, size - stripX, size, cornerY, size - cornerY);

    const baseRgb =
      averageRgb([topLeftRgb, topRightRgb, bottomLeftRgb, bottomRightRgb, leftMiddleRgb, rightMiddleRgb]) ||
      sampleDominantRgb(data, false) ||
      sampleDominantRgb(data, true);

    if (!baseRgb) return buildStandardProductCardBackgroundStyle();

    const adaptiveTopRgb =
      averageRgb([topLeftRgb, topRightRgb, leftMiddleRgb, rightMiddleRgb]) || mixRgb(baseRgb, WHITE_RGB, 0.16);
    const adaptiveBottomRgb =
      averageRgb([bottomLeftRgb, bottomRightRgb, leftMiddleRgb, rightMiddleRgb]) ||
      mixRgb(baseRgb, WHITE_RGB, 0.08);

    return buildAdaptiveGradientStyle(baseRgb, adaptiveTopRgb, adaptiveBottomRgb);
  } catch {
    return buildStandardProductCardBackgroundStyle();
  }
};

export const getAdaptiveProductCardBackgroundStyle = (imageUrl?: string | null): Promise<CSSProperties> => {
  const normalizedUrl = String(imageUrl ?? "").trim();
  if (!normalizedUrl) return Promise.resolve(buildStandardProductCardBackgroundStyle());

  const cached = adaptiveBackgroundCache.get(normalizedUrl);
  if (cached) return Promise.resolve(cached);

  const pending = adaptiveBackgroundPromiseCache.get(normalizedUrl);
  if (pending) return pending;

  const promise = extractAdaptiveBackgroundStyle(normalizedUrl)
    .then((style) => {
      adaptiveBackgroundCache.set(normalizedUrl, style);
      adaptiveBackgroundPromiseCache.delete(normalizedUrl);
      return style;
    })
    .catch(() => {
      adaptiveBackgroundPromiseCache.delete(normalizedUrl);
      return buildStandardProductCardBackgroundStyle();
    });

  adaptiveBackgroundPromiseCache.set(normalizedUrl, promise);
  return promise;
};
