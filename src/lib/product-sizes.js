const normalizeSize = (size) => String(size || "").trim();

export const getAvailableProductSizes = (product = {}) => {
  const rawSizes = Array.isArray(product.sizes) ? product.sizes : [];
  const sizes = rawSizes.map(normalizeSize).filter(Boolean);
  const stock = product.sizeStock && typeof product.sizeStock === "object"
    ? product.sizeStock
    : null;

  if (!stock || Object.keys(stock).length === 0) {
    return sizes;
  }

  return sizes.filter((size) => Number(stock[size]) > 0);
};

export const getCompactProductSizes = (product = {}, maxVisible = 5) => {
  const sizes = getAvailableProductSizes(product);
  const visible = sizes.slice(0, maxVisible);

  return {
    visible,
    hiddenCount: Math.max(0, sizes.length - visible.length),
    total: sizes.length,
  };
};
