import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  HOME_TRUST_BENEFIT_LAYOUT_OPTIONS,
  HOME_TRUST_ICON_OPTIONS,
  parseHomeTrustAbout,
  parseHomeTrustBenefits,
  parseHomeTrustHero,
  parseHomeTrustReviews,
  serializeHomeTrustSetting,
} from "@/lib/home-trust-settings";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

type SettingsMap = Record<string, string>;
type UpdateSettingHandler = (key: string, value: string) => void;

type AdminHomeTrustSettingsProps = {
  settings: SettingsMap;
  updateSetting: UpdateSettingHandler;
};

const ICON_LABELS: Record<string, string> = {
  flame: "Огонь",
  shirt: "Футболка",
  truck: "Доставка",
  shield: "Гарантия",
  sparkles: "Акцент",
  refresh: "Возврат",
  "badge-check": "Проверка",
  message: "Отзыв",
};

const LAYOUT_LABELS: Record<string, string> = {
  left: "Слева",
  center: "По центру",
  right: "Справа",
};

const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const moveItem = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;

  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(nextIndex, 0, item);
  return nextItems.map((nextItem, nextItemIndex) => ({
    ...nextItem,
    sortOrder: (nextItemIndex + 1) * 10,
  }));
};

const normalizeTextareaRows = (value: string, minRows = 3) =>
  Math.max(minRows, Math.min(8, value.split("\n").length + 1));

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">
      {children}
    </Label>
  );
}

function SectionShell({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border border-neutral-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-black uppercase tracking-tight">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Checkbox checked={enabled} onCheckedChange={(checked) => onToggle(checked === true)} />
          {enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          Показывать
        </label>
      </div>
      <div className={enabled ? "space-y-4" : "space-y-4 opacity-60"}>{children}</div>
    </section>
  );
}

export default function AdminHomeTrustSettings({
  settings,
  updateSetting,
}: AdminHomeTrustSettingsProps) {
  const hero = useMemo(() => parseHomeTrustHero(settings.home_trust_hero_json), [settings.home_trust_hero_json]);
  const benefits = useMemo(
    () => parseHomeTrustBenefits(settings.home_trust_benefits_json),
    [settings.home_trust_benefits_json],
  );
  const about = useMemo(() => parseHomeTrustAbout(settings.home_trust_about_json), [settings.home_trust_about_json]);
  const reviews = useMemo(
    () => parseHomeTrustReviews(settings.home_trust_reviews_json),
    [settings.home_trust_reviews_json],
  );

  const saveHero = (patch: Record<string, unknown>) =>
    updateSetting("home_trust_hero_json", serializeHomeTrustSetting({ ...hero, ...patch }));
  const saveBenefits = (patch: Record<string, unknown>) =>
    updateSetting("home_trust_benefits_json", serializeHomeTrustSetting({ ...benefits, items: benefits.allItems, ...patch }));
  const saveAbout = (patch: Record<string, unknown>) =>
    updateSetting("home_trust_about_json", serializeHomeTrustSetting({ ...about, highlights: about.allHighlights, ...patch }));
  const saveReviews = (patch: Record<string, unknown>) =>
    updateSetting("home_trust_reviews_json", serializeHomeTrustSetting({ ...reviews, items: reviews.allItems, ...patch }));

  const updateBenefit = (id: string, patch: Record<string, unknown>) => {
    saveBenefits({
      items: benefits.allItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  };

  const updateHighlight = (id: string, patch: Record<string, unknown>) => {
    saveAbout({
      highlights: about.allHighlights.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  };

  const updateReview = (id: string, patch: Record<string, unknown>) => {
    saveReviews({
      items: reviews.allItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  };

  return (
    <div className="space-y-4 border p-3">
      <div className="space-y-1">
        <h3 className="text-2xl font-black uppercase">Главная страница</h3>
        <p className="text-sm text-muted-foreground">
          Управление первым экраном, преимуществами, блоком доверия и ручными отзывами. После изменений нажмите
          кнопку сохранения текущего раздела внизу страницы.
        </p>
      </div>

      <section className="space-y-4 border border-neutral-200 p-4">
        <div className="space-y-1">
          <h3 className="text-lg font-black uppercase tracking-tight">Дизайн и доставка</h3>
          <p className="text-sm text-muted-foreground">
            Акцентный цвет кнопок и порог бесплатной доставки, которые используются на витрине и в оформлении заказа.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <FieldLabel htmlFor="site-accent-color">Основной акцент</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="site-accent-color"
                type="color"
                value={settings.site_accent_color || "#dc2626"}
                onChange={(event) => updateSetting("site_accent_color", event.target.value)}
                className="h-10 w-14 p-1"
              />
              <Input
                value={settings.site_accent_color || "#dc2626"}
                onChange={(event) => updateSetting("site_accent_color", event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="site-accent-hover-color">Акцент при наведении</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="site-accent-hover-color"
                type="color"
                value={settings.site_accent_hover_color || "#ef4444"}
                onChange={(event) => updateSetting("site_accent_hover_color", event.target.value)}
                className="h-10 w-14 p-1"
              />
              <Input
                value={settings.site_accent_hover_color || "#ef4444"}
                onChange={(event) => updateSetting("site_accent_hover_color", event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="checkout-free-shipping-threshold">Бесплатная доставка от</FieldLabel>
            <Input
              id="checkout-free-shipping-threshold"
              inputMode="numeric"
              value={settings.checkout_free_shipping_threshold || "5000"}
              onChange={(event) => updateSetting("checkout_free_shipping_threshold", event.target.value)}
            />
          </div>
        </div>
      </section>

      <SectionShell
        title="Hero"
        description="Первый экран с оффером, CTA и короткой строкой доверия."
        enabled={hero.enabled}
        onToggle={(enabled) => saveHero({ enabled })}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <FieldLabel htmlFor="home-hero-eyebrow">Надзаголовок</FieldLabel>
            <Input id="home-hero-eyebrow" value={hero.eyebrow} onChange={(event) => saveHero({ eyebrow: event.target.value })} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <Checkbox
              checked={hero.eyebrowEnabled}
              onCheckedChange={(checked) => saveHero({ eyebrowEnabled: checked === true })}
            />
            Показывать надзаголовок
          </label>
          <div className="space-y-1">
            <FieldLabel htmlFor="home-hero-title">Заголовок</FieldLabel>
            <Input id="home-hero-title" value={hero.title} onChange={(event) => saveHero({ title: event.target.value })} />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="home-hero-subtitle">Подзаголовок</FieldLabel>
            <Input id="home-hero-subtitle" value={hero.subtitle} onChange={(event) => saveHero({ subtitle: event.target.value })} />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="home-hero-primary-text">Основная кнопка</FieldLabel>
            <Input id="home-hero-primary-text" value={hero.primaryCtaText} onChange={(event) => saveHero({ primaryCtaText: event.target.value })} />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="home-hero-primary-url">Ссылка основной кнопки</FieldLabel>
            <Input id="home-hero-primary-url" value={hero.primaryCtaUrl} onChange={(event) => saveHero({ primaryCtaUrl: event.target.value })} />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="home-hero-secondary-text">Вторая кнопка</FieldLabel>
            <Input id="home-hero-secondary-text" value={hero.secondaryCtaText} onChange={(event) => saveHero({ secondaryCtaText: event.target.value })} />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="home-hero-secondary-url">Ссылка второй кнопки</FieldLabel>
            <Input id="home-hero-secondary-url" value={hero.secondaryCtaUrl} onChange={(event) => saveHero({ secondaryCtaUrl: event.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <FieldLabel htmlFor="home-hero-meta">Мелкий текст под кнопками</FieldLabel>
            <Input id="home-hero-meta" value={hero.metaText} onChange={(event) => saveHero({ metaText: event.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
            <Checkbox
              checked={hero.secondaryCtaEnabled}
              onCheckedChange={(checked) => saveHero({ secondaryCtaEnabled: checked === true })}
            />
            Показывать вторую кнопку
          </label>
        </div>
      </SectionShell>

      <SectionShell
        title="Преимущества"
        description="Карточки сразу после первого экрана. Текст про Poizon сюда не добавляем."
        enabled={benefits.enabled}
        onToggle={(enabled) => saveBenefits({ enabled })}
      >
        <div className="space-y-1">
          <FieldLabel htmlFor="home-benefits-title">Заголовок секции</FieldLabel>
          <Input id="home-benefits-title" value={benefits.title} onChange={(event) => saveBenefits({ title: event.target.value })} />
        </div>
        <div className="space-y-3">
          {benefits.allItems.map((item, index) => (
            <div key={item.id} className="space-y-3 border border-neutral-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Checkbox checked={item.enabled} onCheckedChange={(checked) => updateBenefit(item.id, { enabled: checked === true })} />
                  {item.title || "Преимущество"}
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => saveBenefits({ items: moveItem(benefits.allItems, index, -1) })}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => saveBenefits({ items: moveItem(benefits.allItems, index, 1) })}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => saveBenefits({ items: benefits.allItems.filter((nextItem) => nextItem.id !== item.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-[180px_180px_1fr_1fr]">
                <div className="space-y-1">
                  <FieldLabel htmlFor={`benefit-icon-${item.id}`}>Иконка</FieldLabel>
                  <Select value={item.icon} onValueChange={(value) => updateBenefit(item.id, { icon: value })}>
                    <SelectTrigger id={`benefit-icon-${item.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOME_TRUST_ICON_OPTIONS.map((icon) => (
                        <SelectItem key={icon} value={icon}>{ICON_LABELS[icon] || icon}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor={`benefit-layout-${item.id}`}>Иконка в карточке</FieldLabel>
                  <Select value={item.layout} onValueChange={(value) => updateBenefit(item.id, { layout: value })}>
                    <SelectTrigger id={`benefit-layout-${item.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOME_TRUST_BENEFIT_LAYOUT_OPTIONS.map((layout) => (
                        <SelectItem key={layout} value={layout}>{LAYOUT_LABELS[layout] || layout}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor={`benefit-title-${item.id}`}>Заголовок</FieldLabel>
                  <Input id={`benefit-title-${item.id}`} value={item.title} onChange={(event) => updateBenefit(item.id, { title: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor={`benefit-description-${item.id}`}>Описание</FieldLabel>
                  <Textarea
                    id={`benefit-description-${item.id}`}
                    value={item.description}
                    rows={normalizeTextareaRows(item.description, 2)}
                    onChange={(event) => updateBenefit(item.id, { description: event.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-none"
            onClick={() =>
              saveBenefits({
                items: [
                  ...benefits.allItems,
                  {
                    id: createId("benefit"),
                    icon: "sparkles",
                    layout: "left",
                    title: "Новое преимущество",
                    description: "Коротко опишите, почему покупателю стоит выбрать магазин.",
                    sortOrder: (benefits.allItems.length + 1) * 10,
                    enabled: true,
                  },
                ],
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Добавить преимущество
          </Button>
        </div>
      </SectionShell>

      <SectionShell
        title="О нас"
        description="Блок доверия: кто магазин, чем полезен покупателю и почему ему можно доверять."
        enabled={about.enabled}
        onToggle={(enabled) => saveAbout({ enabled })}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <FieldLabel htmlFor="home-about-eyebrow">Надзаголовок</FieldLabel>
            <Input id="home-about-eyebrow" value={about.eyebrow} onChange={(event) => saveAbout({ eyebrow: event.target.value })} />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="home-about-title">Заголовок</FieldLabel>
            <Input id="home-about-title" value={about.title} onChange={(event) => saveAbout({ title: event.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <FieldLabel htmlFor="home-about-text">Текст</FieldLabel>
            <Textarea id="home-about-text" value={about.text} rows={normalizeTextareaRows(about.text, 4)} onChange={(event) => saveAbout({ text: event.target.value })} />
          </div>
        </div>
        <div className="space-y-3">
          {about.allHighlights.map((item, index) => (
            <div key={item.id} className="space-y-3 border border-neutral-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Checkbox checked={item.enabled} onCheckedChange={(checked) => updateHighlight(item.id, { enabled: checked === true })} />
                  {item.title || "Акцент"}
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => saveAbout({ highlights: moveItem(about.allHighlights, index, -1) })}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => saveAbout({ highlights: moveItem(about.allHighlights, index, 1) })}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => saveAbout({ highlights: about.allHighlights.filter((nextItem) => nextItem.id !== item.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <FieldLabel htmlFor={`highlight-title-${item.id}`}>Заголовок</FieldLabel>
                  <Input id={`highlight-title-${item.id}`} value={item.title} onChange={(event) => updateHighlight(item.id, { title: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor={`highlight-description-${item.id}`}>Описание</FieldLabel>
                  <Textarea id={`highlight-description-${item.id}`} value={item.description} rows={normalizeTextareaRows(item.description, 2)} onChange={(event) => updateHighlight(item.id, { description: event.target.value })} />
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-none"
            onClick={() =>
              saveAbout({
                highlights: [
                  ...about.allHighlights,
                  {
                    id: createId("highlight"),
                    title: "Новый акцент",
                    description: "Добавьте короткое доверительное преимущество.",
                    sortOrder: (about.allHighlights.length + 1) * 10,
                    enabled: true,
                  },
                ],
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Добавить акцент
          </Button>
        </div>
      </SectionShell>

      <SectionShell
        title="Отзывы"
        description="Ручные отзывы с источником и ссылкой на оригинал. Парсинга Otzovik здесь нет."
        enabled={reviews.enabled}
        onToggle={(enabled) => saveReviews({ enabled })}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <FieldLabel htmlFor="home-reviews-title">Заголовок</FieldLabel>
            <Input id="home-reviews-title" value={reviews.title} onChange={(event) => saveReviews({ title: event.target.value })} />
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="home-reviews-source-label">Подпись источника</FieldLabel>
            <Input id="home-reviews-source-label" value={reviews.sourceLabel} onChange={(event) => saveReviews({ sourceLabel: event.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <FieldLabel htmlFor="home-reviews-description">Описание</FieldLabel>
            <Textarea id="home-reviews-description" value={reviews.description} rows={normalizeTextareaRows(reviews.description, 2)} onChange={(event) => saveReviews({ description: event.target.value })} />
          </div>
        </div>
        <div className="space-y-3">
          {reviews.allItems.map((item, index) => (
            <div key={item.id} className="space-y-3 border border-neutral-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Checkbox checked={item.enabled} onCheckedChange={(checked) => updateReview(item.id, { enabled: checked === true })} />
                  {item.author || "Отзыв"}
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => saveReviews({ items: moveItem(reviews.allItems, index, -1) })}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => saveReviews({ items: moveItem(reviews.allItems, index, 1) })}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => saveReviews({ items: reviews.allItems.filter((nextItem) => nextItem.id !== item.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <FieldLabel htmlFor={`review-text-${item.id}`}>Текст отзыва</FieldLabel>
                  <Textarea id={`review-text-${item.id}`} value={item.text} rows={normalizeTextareaRows(item.text, 3)} onChange={(event) => updateReview(item.id, { text: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor={`review-author-${item.id}`}>Автор</FieldLabel>
                  <Input id={`review-author-${item.id}`} value={item.author} onChange={(event) => updateReview(item.id, { author: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor={`review-location-${item.id}`}>Город / подпись</FieldLabel>
                  <Input id={`review-location-${item.id}`} value={item.location} onChange={(event) => updateReview(item.id, { location: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor={`review-source-${item.id}`}>Источник</FieldLabel>
                  <Input id={`review-source-${item.id}`} value={item.source} onChange={(event) => updateReview(item.id, { source: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor={`review-source-url-${item.id}`}>Ссылка на оригинал</FieldLabel>
                  <Input id={`review-source-url-${item.id}`} value={item.sourceUrl} placeholder="https://otzovik.com/..." onChange={(event) => updateReview(item.id, { sourceUrl: event.target.value })} />
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-none"
            onClick={() =>
              saveReviews({
                items: [
                  ...reviews.allItems,
                  {
                    id: createId("review"),
                    text: "Текст отзыва",
                    author: "@buyer",
                    location: "",
                    source: "Otzovik",
                    sourceUrl: "",
                    sortOrder: (reviews.allItems.length + 1) * 10,
                    enabled: true,
                  },
                ],
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Добавить отзыв
          </Button>
        </div>
      </SectionShell>
    </div>
  );
}
