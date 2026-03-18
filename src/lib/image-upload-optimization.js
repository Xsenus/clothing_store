export const IMAGE_UPLOAD_CONTEXTS = [
  {
    key: "gallery",
    label: "Галерея",
    description: "Пакетная загрузка и ручное добавление изображений в общую галерею.",
  },
  {
    key: "product_media",
    label: "Медиа товара",
    description: "Изображения для слотов товара и загрузка через выбор из галереи.",
  },
  {
    key: "review_media",
    label: "Отзывы покупателей",
    description: "Фото и видео, которые пользователи прикладывают к отзывам.",
  },
  {
    key: "telegram_bot",
    label: "Telegram-бот",
    description: "Изображение профиля бота в настройках интеграции.",
  },
];

const DEFAULT_IMAGE_UPLOAD_CONTEXT_SETTINGS = {
  gallery: { enabled: "true", maxWidth: "2560", maxHeight: "2560", quality: "92" },
  product_media: { enabled: "true", maxWidth: "2560", maxHeight: "2560", quality: "92" },
  review_media: { enabled: "true", maxWidth: "2000", maxHeight: "2000", quality: "90" },
  telegram_bot: { enabled: "true", maxWidth: "1600", maxHeight: "1600", quality: "92" },
};

export const getImageUploadSettingKey = (context, suffix) => `image_upload_${context}_${suffix}`;

export const IMAGE_UPLOAD_SETTING_DEFAULTS = Object.fromEntries(
  IMAGE_UPLOAD_CONTEXTS.flatMap((context) => {
    const defaults = DEFAULT_IMAGE_UPLOAD_CONTEXT_SETTINGS[context.key];
    return [
      [getImageUploadSettingKey(context.key, "enabled"), defaults.enabled],
      [getImageUploadSettingKey(context.key, "max_width"), defaults.maxWidth],
      [getImageUploadSettingKey(context.key, "max_height"), defaults.maxHeight],
      [getImageUploadSettingKey(context.key, "quality"), defaults.quality],
    ];
  }),
);

const NON_OPTIMIZABLE_IMAGE_TYPES = new Set([
  "image/gif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const clampInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const parseBoolean = (value, fallback) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const getTargetMimeType = (file, forceMimeType) => {
  if (forceMimeType) return forceMimeType;

  const normalizedType = String(file?.type || "").toLowerCase();
  if (normalizedType === "image/png") return "image/png";
  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg" || normalizedType === "image/jfif") return "image/jpeg";
  if (normalizedType === "image/webp") return "image/webp";
  if (normalizedType === "image/bmp") return "image/png";
  if (normalizedType === "image/avif") return "image/webp";
  return "image/webp";
};

const getExtensionForMimeType = (mimeType, fallbackName = "image") => {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    default:
      return /\.[^.]+$/.test(fallbackName) ? fallbackName.slice(fallbackName.lastIndexOf(".")) : ".bin";
  }
};

const renameFileWithExtension = (file, extension) => {
  const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "upload";
  return `${baseName}${extension}`;
};

const canvasToBlob = (canvas, mimeType, quality) => new Promise((resolve) => {
  const qualityValue = mimeType === "image/png" ? undefined : quality / 100;
  canvas.toBlob((blob) => resolve(blob), mimeType, qualityValue);
});

const loadImageSource = async (file) => {
  if (typeof window === "undefined") return null;

  if (typeof window.createImageBitmap === "function") {
    const bitmap = await window.createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
      cleanup: () => bitmap.close?.(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      element.src = objectUrl;
    });

    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      draw: (ctx, width, height) => ctx.drawImage(image, 0, 0, width, height),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

export const getImageUploadSettings = (settings, context) => {
  const defaults = DEFAULT_IMAGE_UPLOAD_CONTEXT_SETTINGS[context] || DEFAULT_IMAGE_UPLOAD_CONTEXT_SETTINGS.gallery;
  const source = settings && typeof settings === "object" ? settings : {};

  return {
    enabled: parseBoolean(source[getImageUploadSettingKey(context, "enabled")], defaults.enabled === "true"),
    maxWidth: clampInteger(source[getImageUploadSettingKey(context, "max_width")], 320, 6000, Number.parseInt(defaults.maxWidth, 10)),
    maxHeight: clampInteger(source[getImageUploadSettingKey(context, "max_height")], 320, 6000, Number.parseInt(defaults.maxHeight, 10)),
    quality: clampInteger(source[getImageUploadSettingKey(context, "quality")], 60, 100, Number.parseInt(defaults.quality, 10)),
  };
};

export const optimizeImageFileForUpload = async (file, settings, context, overrides = {}) => {
  if (!(file instanceof File)) return file;
  if (!String(file.type || "").toLowerCase().startsWith("image/")) return file;
  if (NON_OPTIMIZABLE_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) return file;

  const options = {
    ...getImageUploadSettings(settings, context),
    ...overrides,
  };

  if (!options.enabled) return file;
  if (typeof document === "undefined") return file;

  let imageSource = null;
  try {
    imageSource = await loadImageSource(file);
    if (!imageSource?.width || !imageSource?.height) return file;

    const widthRatio = options.maxWidth / imageSource.width;
    const heightRatio = options.maxHeight / imageSource.height;
    const scale = Math.min(1, widthRatio, heightRatio);
    const targetWidth = Math.max(1, Math.round(imageSource.width * scale));
    const targetHeight = Math.max(1, Math.round(imageSource.height * scale));
    const resized = targetWidth !== imageSource.width || targetHeight !== imageSource.height;
    const targetMimeType = getTargetMimeType(file, overrides.forceMimeType);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context2d = canvas.getContext("2d", { alpha: targetMimeType !== "image/jpeg" });
    if (!context2d) return file;

    if (targetMimeType === "image/jpeg") {
      context2d.fillStyle = "#ffffff";
      context2d.fillRect(0, 0, targetWidth, targetHeight);
    }

    context2d.imageSmoothingEnabled = true;
    context2d.imageSmoothingQuality = "high";
    imageSource.draw(context2d, targetWidth, targetHeight);

    const blob = await canvasToBlob(canvas, targetMimeType, options.quality);
    if (!blob || blob.size <= 0) return file;
    if (blob.size >= file.size && !options.allowLargerResult) return file;

    const nextName = renameFileWithExtension(file, getExtensionForMimeType(blob.type, file.name));
    return new File([blob], nextName, {
      type: blob.type || file.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    imageSource?.cleanup?.();
  }
};

export const optimizeFilesForUpload = async (files, settings, context, overrides = {}) => {
  const list = Array.isArray(files) ? files : Array.from(files || []);
  if (list.length === 0) return [];

  const result = [];
  for (const file of list) {
    result.push(await optimizeImageFileForUpload(file, settings, context, overrides));
  }

  return result;
};
