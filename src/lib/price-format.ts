export const formatProductPrice = (rawPrice: number | string | null | undefined) => {
  const numericPrice = Number(rawPrice ?? 0);
  if (!Number.isFinite(numericPrice)) {
    return "0 ₽";
  }

  const normalizedPrice = Math.round((numericPrice + Number.EPSILON) * 100) / 100;
  const [wholePart, fractionalPart] = normalizedPrice.toFixed(2).split(".");
  const groupedWholePart = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  if (fractionalPart === "00") {
    return `${groupedWholePart} ₽`;
  }

  return `${groupedWholePart}.${fractionalPart} ₽`;
};
