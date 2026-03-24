import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, CalendarRange, CreditCard, Heart, MousePointerClick, Package, RefreshCcw, ShoppingCart, Truck, Users, Wallet } from "lucide-react";

import LoadingSpinner from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AdminAnalyticsCountItem {
  type?: string;
  key: string;
  label: string;
  count: number;
}

export interface AdminAnalyticsBucketItem extends AdminAnalyticsCountItem {
  units?: number;
  revenueAmount?: number;
  shippingAmount?: number;
}

export interface AdminAnalyticsProductItem {
  productId: string;
  productName: string;
  imageUrl?: string | null;
  isHidden?: boolean;
  currentStock?: number;
  favoritesCount?: number;
  favoriteAddsCount?: number;
  favoriteRemovalsCount?: number;
  uniqueViewers?: number;
  totalViews?: number;
  soldUnits?: number;
  revenueAmount?: number;
  ordersCount?: number;
}

export interface AdminAnalyticsDailyPoint {
  dayKey: number;
  date: string;
  label: string;
  ordersCount?: number;
  successfulOrdersCount?: number;
  soldUnits?: number;
  revenueAmount?: number;
  shippingRevenueAmount?: number;
  newUsersCount?: number;
  favoritesAddedCount?: number;
  favoritesRemovedCount?: number;
  totalViewEvents?: number;
  uniqueViewers?: number;
  loginsCount?: number;
  siteVisitorsCount?: number;
  siteVisitEventsCount?: number;
  uniquePurchasersCount?: number;
  purchaseConversionRate?: number;
}

export interface AdminAnalyticsSummary {
  date?: string;
  ordersCount?: number;
  successfulOrdersCount?: number;
  deliveredOrdersCount?: number;
  canceledOrdersCount?: number;
  soldUnits?: number;
  revenueAmount?: number;
  shippingRevenueAmount?: number;
  averageOrderValue?: number;
  averageItemsPerOrder?: number;
  newUsersCount?: number;
  favoritesAddedCount?: number;
  favoritesRemovedCount?: number;
  favoriteUsersCount?: number;
  loginEventsCount?: number;
  totalViewEvents?: number;
  totalUniqueViewers?: number;
  viewedProductsCount?: number;
  uniqueVisitorsCount?: number;
  visitEventsCount?: number;
  uniquePurchasersCount?: number;
  purchaseConversionRate?: number;
}

export interface AdminAnalyticsResponse {
  period?: {
    dateFrom?: string;
    dateTo?: string;
    fromTimestamp?: number;
    toTimestamp?: number;
    days?: number;
  };
  comparison?: {
    previousPeriod?: {
      dateFrom?: string;
      dateTo?: string;
      fromTimestamp?: number;
      toTimestamp?: number;
      days?: number;
    };
    previousSummary?: {
      ordersCount?: number;
      successfulOrdersCount?: number;
      deliveredOrdersCount?: number;
      canceledOrdersCount?: number;
      soldUnits?: number;
      revenueAmount?: number;
      shippingRevenueAmount?: number;
      averageOrderValue?: number;
      averageItemsPerOrder?: number;
      newUsersCount?: number;
      favoritesAddedCount?: number;
      favoritesRemovedCount?: number;
      favoriteUsersCount?: number;
      loginEventsCount?: number;
      totalViewEvents?: number;
      totalUniqueViewers?: number;
      viewedProductsCount?: number;
      uniqueVisitorsCount?: number;
      visitEventsCount?: number;
      uniquePurchasersCount?: number;
      purchaseConversionRate?: number;
    };
    previousDay?: {
      dateFrom?: string;
      dateTo?: string;
      fromTimestamp?: number;
      toTimestamp?: number;
      days?: number;
    };
    previousDaySummary?: AdminAnalyticsSummary;
  };
  snapshot?: {
    totalProducts?: number;
    visibleProducts?: number;
    hiddenProducts?: number;
    currentStockUnits?: number;
    visibleInStockProducts?: number;
    outOfStockVisibleProducts?: number;
    lowStockVisibleProducts?: number;
    totalFavorites?: number;
    uniqueFavoriteUsers?: number;
    totalUsers?: number;
    totalSiteVisitors?: number;
  };
  todaySummary?: AdminAnalyticsSummary;
  periodSummary?: AdminAnalyticsSummary;
  orders?: {
    byStatus?: AdminAnalyticsBucketItem[];
    byPurchaseChannel?: AdminAnalyticsBucketItem[];
    byShippingMethod?: AdminAnalyticsBucketItem[];
  };
  payments?: {
    byMethod?: AdminAnalyticsBucketItem[];
    byGroup?: AdminAnalyticsBucketItem[];
    byProvider?: AdminAnalyticsBucketItem[];
  };
  users?: {
    registrationsByChannel?: AdminAnalyticsCountItem[];
    externalActiveUsersByProvider?: AdminAnalyticsCountItem[];
    connectedExternalUsersByProvider?: AdminAnalyticsCountItem[];
    loginsByProvider?: AdminAnalyticsCountItem[];
  };
  products?: {
    topPopular?: AdminAnalyticsProductItem[];
    topSold?: AdminAnalyticsProductItem[];
    topWishlisted?: AdminAnalyticsProductItem[];
  };
  trends?: {
    daily?: AdminAnalyticsDailyPoint[];
  };
}

interface AdminAnalyticsTabProps {
  analytics: AdminAnalyticsResponse | null;
  loading: boolean;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onApplyPreset: (days: number) => void;
  onRefresh: () => void;
  formatRubles: (value?: number | string | null) => string;
}

const formatInteger = (value?: number | null) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value ?? 0));

const formatDecimal = (value?: number | null) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

const formatPercent = (value?: number | null) => `${formatDecimal(value)}%`;

const getComparisonMeta = (currentValue?: number | null, previousValue?: number | null) => {
  const current = Number(currentValue ?? 0);
  const previous = Number(previousValue ?? 0);

  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }

  const delta = current - previous;
  if (delta === 0) {
    return {
      text: "Без изменений к прошлому периоду",
      tone: "neutral" as const,
    };
  }

  if (previous === 0) {
    return {
      text: delta > 0 ? "Рост относительно нуля" : "Снижение к нулю",
      tone: delta > 0 ? "positive" as const : "negative" as const,
    };
  }

  const deltaPercent = (delta / previous) * 100;
  const sign = deltaPercent > 0 ? "+" : "";
  return {
    text: `${sign}${formatDecimal(deltaPercent)}% к прошлому периоду`,
    tone: deltaPercent > 0 ? "positive" as const : "negative" as const,
  };
};

const MetricCard = ({
  icon,
  title,
  value,
  hint,
  comparisonText,
  comparisonTone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  value: string;
  hint?: string;
  comparisonText?: string;
  comparisonTone?: "positive" | "negative" | "neutral";
}) => (
  <div className="border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
        <div className="text-2xl font-black leading-none">{value}</div>
        {hint ? <div className="text-sm text-muted-foreground">{hint}</div> : null}
        {comparisonText ? (
          <div
            className={`text-xs font-semibold ${
              comparisonTone === "positive"
                ? "text-emerald-700"
                : comparisonTone === "negative"
                  ? "text-red-700"
                  : "text-muted-foreground"
            }`}
          >
            {comparisonText}
          </div>
        ) : null}
      </div>
      <div className="flex h-11 w-11 items-center justify-center border border-black bg-black text-white">
        {icon}
      </div>
    </div>
  </div>
);

const BreakdownList = ({
  title,
  description,
  items,
  formatRubles,
  showRevenue = false,
  showUnits = false,
  showShipping = false,
}: {
  title: string;
  description: string;
  items: AdminAnalyticsBucketItem[] | AdminAnalyticsCountItem[] | undefined;
  formatRubles: (value?: number | string | null) => string;
  showRevenue?: boolean;
  showUnits?: boolean;
  showShipping?: boolean;
}) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const maxCount = normalizedItems.reduce((maxValue, item) => Math.max(maxValue, Number(item.count || 0)), 0);

  return (
    <div className="border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-black uppercase">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {normalizedItems.length === 0 ? (
        <div className="border border-dashed border-gray-200 px-4 py-6 text-sm text-muted-foreground">
          За выбранный период данных пока нет.
        </div>
      ) : (
        <div className="space-y-3">
          {normalizedItems.map((item) => {
            const count = Number(item.count || 0);
            const width = maxCount > 0 ? Math.max(8, Math.round((count / maxCount) * 100)) : 0;
            const revenue = "revenueAmount" in item ? Number(item.revenueAmount || 0) : 0;
            const units = "units" in item ? Number(item.units || 0) : 0;
            const shipping = "shippingAmount" in item ? Number(item.shippingAmount || 0) : 0;

            return (
              <div key={`${item.type || "bucket"}-${item.key}`} className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {count > 0 ? `${formatInteger(count)} шт.` : "0"}
                      {showUnits ? ` · ${formatInteger(units)} ед.` : ""}
                      {showRevenue ? ` · ${formatRubles(revenue)}` : ""}
                      {showShipping ? ` · доставка ${formatRubles(shipping)}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-sm font-bold">{formatInteger(count)}</div>
                </div>
                <div className="h-2 bg-gray-100">
                  <div className="h-full bg-black transition-all" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ProductsTable = ({
  title,
  description,
  items,
  mode,
  formatRubles,
}: {
  title: string;
  description: string;
  items: AdminAnalyticsProductItem[] | undefined;
  mode: "popular" | "sold" | "wishlisted";
  formatRubles: (value?: number | string | null) => string;
}) => {
  const normalizedItems = Array.isArray(items) ? items : [];

  return (
    <div className="border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-black uppercase">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {normalizedItems.length === 0 ? (
        <div className="border border-dashed border-gray-200 px-4 py-6 text-sm text-muted-foreground">
          Пока нет данных для рейтинга.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Товар</TableHead>
                {mode === "popular" && <TableHead className="text-right">Уник. просмотры</TableHead>}
                {mode === "popular" && <TableHead className="text-right">Всего кликов</TableHead>}
                {mode === "sold" && <TableHead className="text-right">Продано</TableHead>}
                {mode === "sold" && <TableHead className="text-right">Выручка</TableHead>}
                {mode === "wishlisted" && <TableHead className="text-right">Добавления</TableHead>}
                <TableHead className="text-right">Остаток</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {normalizedItems.map((item) => (
                <TableRow key={`${mode}-${item.productId}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.productName} className="h-14 w-12 shrink-0 bg-gray-100 object-cover" />
                      ) : (
                        <div className="flex h-14 w-12 shrink-0 items-center justify-center bg-gray-200 text-[9px] font-bold uppercase tracking-[0.16em] text-gray-700">
                          FD
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.isHidden ? "Скрыт в каталоге" : "Виден в каталоге"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  {mode === "popular" && <TableCell className="text-right font-medium">{formatInteger(item.uniqueViewers)}</TableCell>}
                  {mode === "popular" && <TableCell className="text-right text-muted-foreground">{formatInteger(item.totalViews)}</TableCell>}
                  {mode === "sold" && <TableCell className="text-right font-medium">{formatInteger(item.soldUnits)}</TableCell>}
                  {mode === "sold" && <TableCell className="text-right text-muted-foreground">{formatRubles(item.revenueAmount)}</TableCell>}
                  {mode === "wishlisted" && (
                    <TableCell className="text-right">
                      <div className="font-medium">{formatInteger(item.favoriteAddsCount)}</div>
                      <div className="text-xs text-muted-foreground">Сейчас в избранном {formatInteger(item.favoritesCount)}</div>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <span className={Number(item.currentStock || 0) > 0 ? "font-medium" : "font-medium text-red-600"}>
                      {formatInteger(item.currentStock)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

const TrendChartCard = ({
  title,
  description,
  items,
  getValue,
  formatValue,
  accentClassName,
}: {
  title: string;
  description: string;
  items: AdminAnalyticsDailyPoint[];
  getValue: (item: AdminAnalyticsDailyPoint) => number;
  formatValue: (value: number) => string;
  accentClassName: string;
}) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const values = normalizedItems.map((item) => Math.max(0, getValue(item)));
  const total = values.reduce((sum, value) => sum + value, 0);
  const maxValue = values.reduce((max, value) => Math.max(max, value), 0);
  const peakIndex = values.findIndex((value) => value === maxValue);
  const peakItem = peakIndex >= 0 ? normalizedItems[peakIndex] : null;
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const node = chartContainerRef.current;
    if (!node) {
      return undefined;
    }

    const updateChartWidth = () => {
      const nextWidth = Math.round(node.getBoundingClientRect().width);
      setChartWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    updateChartWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateChartWidth);
      return () => window.removeEventListener("resize", updateChartWidth);
    }

    const observer = new ResizeObserver(() => {
      updateChartWidth();
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const compact = chartWidth > 0 && chartWidth < 420;
  const width = Math.max(chartWidth || 0, 260);
  const height = compact ? 184 : chartWidth > 0 && chartWidth < 640 ? 200 : 220;
  const paddingX = compact ? 12 : 16;
  const paddingY = compact ? 14 : 18;
  const baseline = height - paddingY;
  const chartHeight = height - paddingY * 2;
  const safeCount = Math.max(normalizedItems.length, 1);
  const stepX = safeCount > 1 ? (width - paddingX * 2) / (safeCount - 1) : 0;

  const points = normalizedItems.map((item, index) => {
    const value = Math.max(0, getValue(item));
    const x = safeCount > 1 ? paddingX + stepX * index : width / 2;
    const y = maxValue > 0 ? baseline - (value / maxValue) * chartHeight : baseline;
    return {
      x,
      y,
      value,
      label: item.label,
      date: item.date,
    };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = points.length > 0
    ? `M ${points[0].x.toFixed(2)} ${baseline.toFixed(2)} ${points
      .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ")} L ${points[points.length - 1].x.toFixed(2)} ${baseline.toFixed(2)} Z`
    : "";

  const firstLabel = normalizedItems[0]?.label || "";
  const middleLabel = normalizedItems[Math.floor((normalizedItems.length - 1) / 2)]?.label || "";
  const lastLabel = normalizedItems[normalizedItems.length - 1]?.label || "";
  const footerLabels = compact ? [firstLabel, lastLabel] : [firstLabel, middleLabel, lastLabel];

  return (
    <div className="border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-black uppercase sm:text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-1 sm:max-w-[220px] sm:text-right">
          <div className="text-2xl font-black">{formatValue(total)}</div>
          <div className="text-xs text-muted-foreground">
            Пик: {peakItem ? `${peakItem.label} · ${formatValue(maxValue)}` : "-"}
          </div>
        </div>
      </div>

      {normalizedItems.length === 0 ? (
        <div className="border border-dashed border-gray-200 px-4 py-8 text-sm text-muted-foreground">
          Нет данных для графика.
        </div>
      ) : (
        <div className="space-y-3">
          <div ref={chartContainerRef} className="w-full overflow-hidden">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
              {[0, 1, 2, 3].map((index) => {
                const y = paddingY + (chartHeight / 3) * index;
                return (
                  <line
                    key={index}
                    x1={paddingX}
                    y1={y}
                    x2={width - paddingX}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                );
              })}

              {areaPath ? <path d={areaPath} className={accentClassName} fill="currentColor" style={{ opacity: 0.15 }} /> : null}
              {linePath ? (
                <path
                  d={linePath}
                  fill="none"
                  className={accentClassName}
                  stroke="currentColor"
                  strokeWidth={compact ? "2.5" : "3"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {points.map((point) => (
                <g key={`${title}-${point.date}`}>
                  <circle cx={point.x} cy={point.y} r={compact ? "3.5" : "4.5"} className={accentClassName} fill="currentColor">
                    <title>{`${point.date}: ${formatValue(point.value)}`}</title>
                  </circle>
                </g>
              ))}
            </svg>
          </div>

          <div className={`grid gap-3 text-[11px] text-muted-foreground ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
            {footerLabels.map((label, index) => (
              <span
                key={`${title}-footer-label-${index}`}
                className={index === 0 ? "text-left" : index === footerLabels.length - 1 ? "text-right" : "text-center"}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function AdminAnalyticsTab({
  analytics,
  loading,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onApplyPreset,
  onRefresh,
  formatRubles,
}: AdminAnalyticsTabProps) {
  const snapshot = analytics?.snapshot;
  const todaySummary = analytics?.todaySummary;
  const periodSummary = analytics?.periodSummary;
  const previousPeriod = analytics?.comparison?.previousPeriod;
  const previousSummary = analytics?.comparison?.previousSummary;
  const previousDay = analytics?.comparison?.previousDay;
  const previousDaySummary = analytics?.comparison?.previousDaySummary;
  const dailyTrend = Array.isArray(analytics?.trends?.daily) ? analytics.trends.daily : [];

  if (loading && !analytics) {
    return <LoadingSpinner className="h-64" />;
  }

  return (
    <div className="space-y-4">
      <div className="border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center border border-black bg-black text-white">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase">Аналитика магазина</h2>
                <p className="text-sm text-muted-foreground">
                  Текущее состояние ассортимента и продажи за выбранный период.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-9 rounded-none" onClick={() => onApplyPreset(7)}>7 дней</Button>
              <Button type="button" variant="outline" className="h-9 rounded-none" onClick={() => onApplyPreset(30)}>30 дней</Button>
              <Button type="button" variant="outline" className="h-9 rounded-none" onClick={() => onApplyPreset(90)}>90 дней</Button>
              <Button type="button" variant="outline" className="h-9 rounded-none" onClick={() => onApplyPreset(365)}>365 дней</Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[170px_170px_auto]">
            <div className="relative">
              <Input id="analytics-date-from" name="analytics_date_from" type="date" aria-label="Дата начала периода аналитики" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} className="h-11 rounded-none pr-11" />
              <CalendarRange className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="relative">
              <Input id="analytics-date-to" name="analytics_date_to" type="date" aria-label="Дата конца периода аналитики" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} className="h-11 rounded-none pr-11" />
              <CalendarRange className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Button type="button" variant="outline" className="h-11 rounded-none" onClick={onRefresh} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {loading ? "Обновляем..." : "Обновить"}
            </Button>
          </div>
        </div>

        {analytics?.period ? (
          <div className="mt-4 text-sm text-muted-foreground">
            Период: <span className="font-medium text-black">{analytics.period.dateFrom}</span> - <span className="font-medium text-black">{analytics.period.dateTo}</span>
            {" · "}
            {formatInteger(analytics.period.days)} дн.
          </div>
        ) : null}

        {previousPeriod ? (
          <div className="mt-2 text-sm text-muted-foreground">
            Сравнение с периодом: <span className="font-medium text-black">{previousPeriod.dateFrom}</span> - <span className="font-medium text-black">{previousPeriod.dateTo}</span>
          </div>
        ) : null}

        <div className="mt-4 border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          История по избранному и входам теперь считается по отдельным событиям. Данные для этих блоков начинают накапливаться с момента применения новой миграции, поэтому старые периоды могут быть неполными.
        </div>
      </div>

      {loading && analytics ? (
        <div className="border border-dashed border-gray-200 px-4 py-3 text-sm text-muted-foreground">
          Пересчитываем аналитику по новому периоду...
        </div>
      ) : null}

      <div className="border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-black uppercase">Сегодня</h3>
            <p className="text-sm text-muted-foreground">
              Быстрая сводка по текущему дню, чтобы не выбирать даты вручную.
            </p>
          </div>
          <div className="space-y-1 text-sm text-muted-foreground lg:text-right">
            <div>
              Дата: <span className="font-medium text-black">{todaySummary?.date || "-"}</span>
            </div>
            {previousDay ? (
              <div>
                Сравнение со вчера: <span className="font-medium text-black">{previousDay.dateFrom}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Users className="h-5 w-5" />}
            title="Посетителей сайта"
            value={formatInteger(todaySummary?.uniqueVisitorsCount)}
            hint={`${formatInteger(todaySummary?.visitEventsCount)} визитов сегодня · всего ${formatInteger(snapshot?.totalSiteVisitors)}`}
            comparisonText={getComparisonMeta(todaySummary?.uniqueVisitorsCount, previousDaySummary?.uniqueVisitorsCount)?.text}
            comparisonTone={getComparisonMeta(todaySummary?.uniqueVisitorsCount, previousDaySummary?.uniqueVisitorsCount)?.tone}
          />
          <MetricCard
            icon={<ShoppingCart className="h-5 w-5" />}
            title="Покупателей сегодня"
            value={formatInteger(todaySummary?.uniquePurchasersCount)}
            hint={`${formatInteger(todaySummary?.successfulOrdersCount)} успешных заказов`}
            comparisonText={getComparisonMeta(todaySummary?.uniquePurchasersCount, previousDaySummary?.uniquePurchasersCount)?.text}
            comparisonTone={getComparisonMeta(todaySummary?.uniquePurchasersCount, previousDaySummary?.uniquePurchasersCount)?.tone}
          />
          <MetricCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="Конверсия в покупку"
            value={formatPercent(todaySummary?.purchaseConversionRate)}
            hint={`${formatInteger(todaySummary?.uniquePurchasersCount)} из ${formatInteger(todaySummary?.uniqueVisitorsCount)} посетителей`}
            comparisonText={getComparisonMeta(todaySummary?.purchaseConversionRate, previousDaySummary?.purchaseConversionRate)?.text}
            comparisonTone={getComparisonMeta(todaySummary?.purchaseConversionRate, previousDaySummary?.purchaseConversionRate)?.tone}
          />
          <MetricCard
            icon={<Wallet className="h-5 w-5" />}
            title="Выручка сегодня"
            value={formatRubles(todaySummary?.revenueAmount)}
            hint={`Средний чек ${formatRubles(todaySummary?.averageOrderValue)}`}
            comparisonText={getComparisonMeta(todaySummary?.revenueAmount, previousDaySummary?.revenueAmount)?.text}
            comparisonTone={getComparisonMeta(todaySummary?.revenueAmount, previousDaySummary?.revenueAmount)?.tone}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          icon={<Package className="h-5 w-5" />}
          title="Товаров в каталоге"
          value={formatInteger(snapshot?.visibleProducts)}
          hint={`Всего ${formatInteger(snapshot?.totalProducts)}, скрыто ${formatInteger(snapshot?.hiddenProducts)}`}
        />
        <MetricCard
          icon={<ShoppingCart className="h-5 w-5" />}
          title="Продано за период"
          value={formatInteger(periodSummary?.soldUnits)}
          hint={`${formatInteger(periodSummary?.successfulOrdersCount)} успешных заказов`}
          comparisonText={getComparisonMeta(periodSummary?.soldUnits, previousSummary?.soldUnits)?.text}
          comparisonTone={getComparisonMeta(periodSummary?.soldUnits, previousSummary?.soldUnits)?.tone}
        />
        <MetricCard
          icon={<Wallet className="h-5 w-5" />}
          title="Выручка за период"
          value={formatRubles(periodSummary?.revenueAmount)}
          hint={`Средний чек ${formatRubles(periodSummary?.averageOrderValue)}`}
          comparisonText={getComparisonMeta(periodSummary?.revenueAmount, previousSummary?.revenueAmount)?.text}
          comparisonTone={getComparisonMeta(periodSummary?.revenueAmount, previousSummary?.revenueAmount)?.tone}
        />
        <MetricCard
          icon={<Users className="h-5 w-5" />}
          title="Новых пользователей"
          value={formatInteger(periodSummary?.newUsersCount)}
          hint={`Всего пользователей ${formatInteger(snapshot?.totalUsers)}`}
          comparisonText={getComparisonMeta(periodSummary?.newUsersCount, previousSummary?.newUsersCount)?.text}
          comparisonTone={getComparisonMeta(periodSummary?.newUsersCount, previousSummary?.newUsersCount)?.tone}
        />
        <MetricCard
          icon={<Users className="h-5 w-5" />}
          title="Посетителей за период"
          value={formatInteger(periodSummary?.uniqueVisitorsCount)}
          hint={`${formatInteger(periodSummary?.visitEventsCount)} визитов · всего ${formatInteger(snapshot?.totalSiteVisitors)}`}
          comparisonText={getComparisonMeta(periodSummary?.uniqueVisitorsCount, previousSummary?.uniqueVisitorsCount)?.text}
          comparisonTone={getComparisonMeta(periodSummary?.uniqueVisitorsCount, previousSummary?.uniqueVisitorsCount)?.tone}
        />
        <MetricCard
          icon={<BarChart3 className="h-5 w-5" />}
          title="Конверсия в покупку"
          value={formatPercent(periodSummary?.purchaseConversionRate)}
          hint={`${formatInteger(periodSummary?.uniquePurchasersCount)} покупателей из ${formatInteger(periodSummary?.uniqueVisitorsCount)} посетителей`}
          comparisonText={getComparisonMeta(periodSummary?.purchaseConversionRate, previousSummary?.purchaseConversionRate)?.text}
          comparisonTone={getComparisonMeta(periodSummary?.purchaseConversionRate, previousSummary?.purchaseConversionRate)?.tone}
        />
        <MetricCard
          icon={<Heart className="h-5 w-5" />}
          title="Товаров в избранном"
          value={formatInteger(snapshot?.totalFavorites)}
          hint={`${formatInteger(snapshot?.uniqueFavoriteUsers)} пользователей добавили в избранное`}
        />
        <MetricCard
          icon={<MousePointerClick className="h-5 w-5" />}
          title="Просмотры товаров"
          value={formatInteger(periodSummary?.totalViewEvents)}
          hint={`${formatInteger(periodSummary?.totalUniqueViewers)} уникальных зрителей`}
          comparisonText={getComparisonMeta(periodSummary?.totalViewEvents, previousSummary?.totalViewEvents)?.text}
          comparisonTone={getComparisonMeta(periodSummary?.totalViewEvents, previousSummary?.totalViewEvents)?.tone}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard
          icon={<Package className="h-5 w-5" />}
          title="Остатков на складе"
          value={formatInteger(snapshot?.currentStockUnits)}
          hint={`${formatInteger(snapshot?.visibleInStockProducts)} товаров в наличии`}
        />
        <MetricCard
          icon={<Truck className="h-5 w-5" />}
          title="Заканчиваются"
          value={formatInteger(snapshot?.lowStockVisibleProducts)}
          hint={`${formatInteger(snapshot?.outOfStockVisibleProducts)} товаров уже без остатка`}
        />
        <MetricCard
          icon={<CreditCard className="h-5 w-5" />}
          title="Стоимость доставки"
          value={formatRubles(periodSummary?.shippingRevenueAmount)}
          hint={`${formatDecimal(periodSummary?.averageItemsPerOrder)} товара в среднем на заказ`}
          comparisonText={getComparisonMeta(periodSummary?.shippingRevenueAmount, previousSummary?.shippingRevenueAmount)?.text}
          comparisonTone={getComparisonMeta(periodSummary?.shippingRevenueAmount, previousSummary?.shippingRevenueAmount)?.tone}
        />
        <MetricCard
          icon={<Heart className="h-5 w-5" />}
          title="Добавлений в избранное"
          value={formatInteger(periodSummary?.favoritesAddedCount)}
          hint={`${formatInteger(periodSummary?.favoriteUsersCount)} пользователей · снятий ${formatInteger(periodSummary?.favoritesRemovedCount)}`}
          comparisonText={getComparisonMeta(periodSummary?.favoritesAddedCount, previousSummary?.favoritesAddedCount)?.text}
          comparisonTone={getComparisonMeta(periodSummary?.favoritesAddedCount, previousSummary?.favoritesAddedCount)?.tone}
        />
        <MetricCard
          icon={<Users className="h-5 w-5" />}
          title="Входов за период"
          value={formatInteger(periodSummary?.loginEventsCount)}
          hint="Все успешные входы: email, Telegram, Google и Яндекс"
          comparisonText={getComparisonMeta(periodSummary?.loginEventsCount, previousSummary?.loginEventsCount)?.text}
          comparisonTone={getComparisonMeta(periodSummary?.loginEventsCount, previousSummary?.loginEventsCount)?.tone}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TrendChartCard
          title="Посетители сайта"
          description="Сколько уникальных посетителей заходило на сайт каждый день."
          items={dailyTrend}
          getValue={(item) => Number(item.siteVisitorsCount || 0)}
          formatValue={(value) => formatInteger(value)}
          accentClassName="text-cyan-700"
        />
        <TrendChartCard
          title="Конверсия в покупку"
          description="Доля посетителей дня, которые дошли до успешной покупки."
          items={dailyTrend}
          getValue={(item) => Number(item.purchaseConversionRate || 0)}
          formatValue={(value) => formatPercent(value)}
          accentClassName="text-fuchsia-700"
        />
        <TrendChartCard
          title="Выручка по дням"
          description="Динамика успешных заказов в рублях."
          items={dailyTrend}
          getValue={(item) => Number(item.revenueAmount || 0)}
          formatValue={(value) => formatRubles(value)}
          accentClassName="text-emerald-600"
        />
        <TrendChartCard
          title="Заказы по дням"
          description="Все созданные заказы внутри выбранного периода."
          items={dailyTrend}
          getValue={(item) => Number(item.ordersCount || 0)}
          formatValue={(value) => formatInteger(value)}
          accentClassName="text-slate-900"
        />
        <TrendChartCard
          title="Продажи по дням"
          description="Сколько единиц товара реально продано по успешным заказам."
          items={dailyTrend}
          getValue={(item) => Number(item.soldUnits || 0)}
          formatValue={(value) => formatInteger(value)}
          accentClassName="text-amber-600"
        />
        <TrendChartCard
          title="Регистрации по дням"
          description="Новые аккаунты, созданные в магазине."
          items={dailyTrend}
          getValue={(item) => Number(item.newUsersCount || 0)}
          formatValue={(value) => formatInteger(value)}
          accentClassName="text-sky-600"
        />
        <TrendChartCard
          title="Просмотры товаров"
          description="Все клики по карточкам товаров за каждый день."
          items={dailyTrend}
          getValue={(item) => Number(item.totalViewEvents || 0)}
          formatValue={(value) => formatInteger(value)}
          accentClassName="text-violet-600"
        />
        <TrendChartCard
          title="Уникальные зрители"
          description="Сколько разных пользователей и посетителей смотрели товары по дням."
          items={dailyTrend}
          getValue={(item) => Number(item.uniqueViewers || 0)}
          formatValue={(value) => formatInteger(value)}
          accentClassName="text-rose-600"
        />
        <TrendChartCard
          title="Добавления в избранное"
          description="Сколько раз товары добавляли в избранное в каждый день выбранного периода."
          items={dailyTrend}
          getValue={(item) => Number(item.favoritesAddedCount || 0)}
          formatValue={(value) => formatInteger(value)}
          accentClassName="text-red-600"
        />
        <TrendChartCard
          title="Входы по дням"
          description="Все успешные входы пользователей, включая email и внешние провайдеры."
          items={dailyTrend}
          getValue={(item) => Number(item.loginsCount || 0)}
          formatValue={(value) => formatInteger(value)}
          accentClassName="text-indigo-600"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownList
          title="Статусы заказов"
          description="Как распределились заказы внутри выбранного периода."
          items={analytics?.orders?.byStatus}
          formatRubles={formatRubles}
          showRevenue
          showUnits
          showShipping
        />
        <BreakdownList
          title="Каналы оформления"
          description="Откуда были оформлены заказы: сайт, админка или приложение."
          items={analytics?.orders?.byPurchaseChannel}
          formatRubles={formatRubles}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownList
          title="Доставка"
          description="Сколько заказов ушло до двери, в ПВЗ или самовывозом."
          items={analytics?.orders?.byShippingMethod}
          formatRubles={formatRubles}
          showRevenue
          showUnits
          showShipping
        />
        <BreakdownList
          title="Оплата по группам"
          description="Переводы, оплата при получении и подключенные платежные системы."
          items={analytics?.payments?.byGroup}
          formatRubles={formatRubles}
          showRevenue
          showUnits
        />
        <BreakdownList
          title="Платежные провайдеры"
          description="Через что реально проходили успешные оплаты."
          items={analytics?.payments?.byProvider}
          formatRubles={formatRubles}
          showRevenue
          showUnits
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownList
          title="Регистрации"
          description="Как пользователи создавали аккаунты за выбранный период."
          items={analytics?.users?.registrationsByChannel}
          formatRubles={formatRubles}
        />
        <BreakdownList
          title="Входы по способам"
          description="Успешные входы через email, Telegram, Google и Яндекс за выбранный период."
          items={analytics?.users?.loginsByProvider}
          formatRubles={formatRubles}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownList
          title="Активные внешние пользователи"
          description="Сколько уникальных пользователей заходили через внешние провайдеры в этот период."
          items={analytics?.users?.externalActiveUsersByProvider}
          formatRubles={formatRubles}
        />
        <BreakdownList
          title="Подключенные способы входа"
          description="Сколько пользователей сейчас имеют привязанные внешние способы авторизации."
          items={analytics?.users?.connectedExternalUsersByProvider}
          formatRubles={formatRubles}
        />
      </div>

      <div className="grid gap-4">
        <ProductsTable
          title="Самые популярные"
          description="Лидеры по уникальным просмотрам карточки товара в выбранном периоде."
          items={analytics?.products?.topPopular}
          mode="popular"
          formatRubles={formatRubles}
        />
        <ProductsTable
          title="Самые продаваемые"
          description="Товары, которые чаще всего покупали в успешных заказах за выбранный период."
          items={analytics?.products?.topSold}
          mode="sold"
          formatRubles={formatRubles}
        />
        <ProductsTable
          title="Лидеры избранного"
          description="Товары, которые чаще всего добавляли в избранное за выбранный период."
          items={analytics?.products?.topWishlisted}
          mode="wishlisted"
          formatRubles={formatRubles}
        />
      </div>
    </div>
  );
}
