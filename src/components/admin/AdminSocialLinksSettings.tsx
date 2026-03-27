import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import SocialLinkIcon from "@/components/social/SocialLinkIcon";
import SocialLinksList from "@/components/social/SocialLinksList";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FLOW } from "@/lib/api-mapping";
import {
  createSiteSocialLinkItem,
  getSiteSocialLinkPreset,
  getSiteSocialLinksForPlacement,
  parseSiteSocialLinksConfig,
  serializeSiteSocialLinksConfig,
  type SiteSocialIconKey,
  type SiteSocialLinkItem,
  type SiteSocialLinkPresetId,
  SITE_SOCIAL_ICON_OPTIONS,
  SITE_SOCIAL_LINK_PRESET_OPTIONS,
} from "@/lib/social-links";

interface AdminSocialLinksSettingsProps {
  value?: string;
  onChange: (nextValue: string) => void;
}

const reorderItems = (items: SiteSocialLinkItem[]) =>
  items.map((item, index) => ({ ...item, sortOrder: index }));

const panelClass = "space-y-4 border border-gray-200 bg-white p-4";
const boxClass = "border border-black/10 bg-white p-4";
const selectClass =
  "h-11 w-full rounded-none border border-black bg-white px-3 text-sm";

const getPlacementLabels = (item: SiteSocialLinkItem) => {
  const labels = [];
  if (item.showInHeader) labels.push("Хедер");
  if (item.showInFooter) labels.push("Футер");
  if (item.showOnPage) labels.push("Страница");
  return labels;
};

function Pill({ children, warn = false }: { children: string; warn?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]",
        warn
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-black/10 bg-white text-black/70",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export default function AdminSocialLinksSettings({
  value,
  onChange,
}: AdminSocialLinksSettingsProps) {
  const confirmAction = useConfirmDialog();
  const [config, setConfig] = useState(() => parseSiteSocialLinksConfig(value));
  const [draftItem, setDraftItem] = useState<SiteSocialLinkItem | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState("");

  useEffect(() => {
    setConfig(parseSiteSocialLinksConfig(value));
  }, [value]);

  const commitConfig = (nextValue: typeof config) => {
    const normalized = parseSiteSocialLinksConfig(nextValue);
    setConfig(normalized);
    onChange(serializeSiteSocialLinksConfig(normalized));
  };

  const updateConfig = (
    updater:
      | typeof config
      | ((currentValue: typeof config) => typeof config),
  ) => {
    const nextValue =
      typeof updater === "function"
        ? (updater as (currentValue: typeof config) => typeof config)(config)
        : updater;
    commitConfig(nextValue);
  };

  const updateItem = (
    itemId: string,
    updater:
      | Partial<SiteSocialLinkItem>
      | ((item: SiteSocialLinkItem) => SiteSocialLinkItem),
  ) => {
    updateConfig((currentValue) => ({
      ...currentValue,
      items: currentValue.items.map((item) =>
        item.id !== itemId
          ? item
          : typeof updater === "function"
            ? updater(item)
            : { ...item, ...updater },
      ),
    }));
  };

  const moveItem = (itemId: string, direction: -1 | 1) => {
    updateConfig((currentValue) => {
      const currentIndex = currentValue.items.findIndex((item) => item.id === itemId);
      const nextIndex = currentIndex + direction;
      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= currentValue.items.length
      ) {
        return currentValue;
      }

      const nextItems = [...currentValue.items];
      const [movedItem] = nextItems.splice(currentIndex, 1);
      nextItems.splice(nextIndex, 0, movedItem);
      return { ...currentValue, items: reorderItems(nextItems) };
    });
  };

  const removeItem = (itemId: string) => {
    updateConfig((currentValue) => ({
      ...currentValue,
      items: reorderItems(
        currentValue.items.filter((item) => item.id !== itemId),
      ),
    }));
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingItemId(null);
    setDraftItem(null);
    setUploadingItemId("");
  };

  const openCreateDialog = (presetId: SiteSocialLinkPresetId = "instagram") => {
    const nextItem = createSiteSocialLinkItem(presetId, config.items.length);
    updateConfig((currentValue) => ({
      ...currentValue,
      items: reorderItems([...currentValue.items, nextItem]),
    }));
    setDraftItem(nextItem);
    setEditingItemId(nextItem.id);
    setUploadingItemId("");
    setIsEditorOpen(true);
  };

  const openEditDialog = (itemId: string) => {
    const item = config.items.find((entry) => entry.id === itemId);
    if (!item) return;
    setDraftItem({ ...item });
    setEditingItemId(itemId);
    setUploadingItemId("");
    setIsEditorOpen(true);
  };

  const updateDraftItem = (
    updater:
      | Partial<SiteSocialLinkItem>
      | ((item: SiteSocialLinkItem) => SiteSocialLinkItem),
  ) => {
    setDraftItem((currentValue) => {
      if (!currentValue) return currentValue;
      const nextValue = typeof updater === "function"
        ? updater(currentValue)
        : { ...currentValue, ...updater };
      if (editingItemId) {
        updateItem(editingItemId, nextValue);
      }
      return nextValue;
    });
  };

  const handleDraftPresetChange = (presetId: SiteSocialLinkPresetId) => {
    updateDraftItem((item) => {
      const currentPreset = getSiteSocialLinkPreset(item.presetId);
      const nextPreset = getSiteSocialLinkPreset(presetId);
      const nextLabel =
        !item.label.trim() || item.label.trim() === currentPreset.defaultLabel
          ? nextPreset.defaultLabel
          : item.label;
      return {
        ...item,
        presetId: nextPreset.id,
        label: nextLabel,
        iconKey: nextPreset.defaultIconKey,
        backgroundColor: nextPreset.backgroundColor,
        iconColor: nextPreset.iconColor,
      };
    });
  };

  const handleDraftFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !draftItem) return;

    setUploadingItemId(draftItem.id);
    try {
      const payload = new FormData();
      payload.append("files", file);
      const result = await FLOW.adminUpload({ input: payload });
      const nextUrl = Array.isArray(result?.urls) ? String(result.urls[0] || "") : "";
      if (!nextUrl) throw new Error("Сервер не вернул URL иконки");
      updateDraftItem({ iconMode: "custom", customIconUrl: nextUrl });
      toast.success("Иконка загружена");
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Не удалось загрузить иконку";
      toast.error(message);
    } finally {
      setUploadingItemId("");
    }
  };

  const handleRemoveItem = async (itemId: string, label?: string) => {
    const confirmed = await confirmAction({
      title: "Удалить ссылку?",
      description: label?.trim()
        ? `Ссылка «${label.trim()}» исчезнет из всех мест вывода.`
        : "Ссылка исчезнет из всех мест вывода.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      variant: "destructive",
    });

    if (!confirmed) return;

    removeItem(itemId);
    if (editingItemId === itemId) {
      closeEditor();
    }
  };

  const headerPreviewItems = useMemo(
    () => getSiteSocialLinksForPlacement(config, "header"),
    [config],
  );
  const footerPreviewItems = useMemo(
    () => getSiteSocialLinksForPlacement(config, "footer"),
    [config],
  );
  const pagePreviewItems = useMemo(
    () => getSiteSocialLinksForPlacement(config, "page"),
    [config],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
        <div className={panelClass}>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold uppercase tracking-[0.12em]">
              Общие параметры
            </h4>
            <p className="text-sm text-muted-foreground">
              Настройка вывода в хедере, футере и на странице соцсетей.
            </p>
          </div>

          <div className="flex min-h-[92px] items-start justify-between gap-4 border border-black/10 p-4">
            <div className="space-y-1">
              <Label htmlFor="social-links-enabled" className="text-sm font-semibold">
                Включить соцсети на сайте
              </Label>
              <p className="text-xs text-muted-foreground">
                Если выключить блок, соцсети исчезнут со всех частей сайта.
              </p>
            </div>
            <Checkbox
              id="social-links-enabled"
              checked={config.enabled}
              onCheckedChange={(checked) =>
                updateConfig((currentValue) => ({
                  ...currentValue,
                  enabled: checked === true,
                }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                title: "Хедер",
                text: "Компактные иконки в шапке сайта.",
                checked: config.headerEnabled,
                key: "headerEnabled",
              },
              {
                title: "Футер",
                text: "Расширенный блок ссылок в футере.",
                checked: config.footerEnabled,
                key: "footerEnabled",
              },
              {
                title: "Страница",
                text: "Отдельная страница `/socials`.",
                checked: config.pageEnabled,
                key: "pageEnabled",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex min-h-[124px] flex-col justify-between gap-4 border border-black/10 p-4"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{item.title}</div>
                  <p className="text-xs text-muted-foreground">{item.text}</p>
                </div>
                <div className="flex justify-end">
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={(checked) =>
                      updateConfig((currentValue) => ({
                        ...currentValue,
                        [item.key]: checked === true,
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="social-links-page-title">Заголовок страницы</Label>
            <Input
              id="social-links-page-title"
              value={config.pageTitle}
              onChange={(event) =>
                updateConfig((currentValue) => ({
                  ...currentValue,
                  pageTitle: event.target.value,
                }))
              }
              placeholder="Мы в соцсетях"
              className="rounded-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="social-links-page-description">Описание страницы</Label>
            <Textarea
              id="social-links-page-description"
              value={config.pageDescription}
              onChange={(event) =>
                updateConfig((currentValue) => ({
                  ...currentValue,
                  pageDescription: event.target.value,
                }))
              }
              placeholder="Выберите удобную площадку и подписывайтесь на обновления магазина."
              rows={4}
              className="rounded-none"
            />
          </div>
        </div>

        <div className={panelClass}>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold uppercase tracking-[0.12em]">
              Предпросмотр
            </h4>
            <p className="text-sm text-muted-foreground">
              Пустые зоны автоматически не появятся на сайте.
            </p>
          </div>

          <div className={boxClass}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Хедер
            </div>
            {headerPreviewItems.length > 0 ? (
              <SocialLinksList items={headerPreviewItems} variant="header" />
            ) : (
              <div className="text-sm text-muted-foreground">Активных ссылок нет.</div>
            )}
          </div>

          <div className="border border-black/10 bg-black p-4 text-white">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
              Футер
            </div>
            {footerPreviewItems.length > 0 ? (
              <SocialLinksList items={footerPreviewItems} variant="footer" />
            ) : (
              <div className="text-sm text-white/60">Активных ссылок нет.</div>
            )}
          </div>

          <div className={boxClass}>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Страница
              </div>
              <div className="text-xl font-black uppercase">
                {config.pageTitle || "Мы в соцсетях"}
              </div>
              <p className="text-sm text-muted-foreground">
                {config.pageDescription ||
                  "Отдельная страница для всех ваших социальных платформ."}
              </p>
            </div>
            <div className="mt-3">
              {pagePreviewItems.length > 0 ? (
                <SocialLinksList items={pagePreviewItems} variant="page" />
              ) : (
                <div className="text-sm text-muted-foreground">
                  Без активных ссылок страница не будет показана.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={panelClass}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold uppercase tracking-[0.12em]">
              Список ссылок
            </h4>
            <p className="text-sm text-muted-foreground">
              Добавление и редактирование происходят в модальном окне.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-none"
            onClick={() => openCreateDialog("instagram")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Добавить ссылку
          </Button>
        </div>

        {config.items.length === 0 ? (
          <div className="border border-dashed border-gray-300 px-4 py-10 text-sm text-muted-foreground">
            Список пуст. Добавьте первую ссылку и настройте ее отображение.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {config.items.map((item, index) => {
              const preset = getSiteSocialLinkPreset(item.presetId);
              const placementLabels = getPlacementLabels(item);

              return (
                <div
                  key={item.id}
                  className="flex h-full flex-col justify-between border border-black/10 bg-stone-50/60 p-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-black/10 bg-white">
                      <SocialLinkIcon item={item} className="h-11 w-11" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Pill>{`Ссылка #${index + 1}`}</Pill>
                        <Pill>{preset.label}</Pill>
                        {!item.enabled ? <Pill warn>Скрыта</Pill> : null}
                        {!item.url.trim() ? <Pill>Без URL</Pill> : null}
                      </div>

                      <div className="space-y-1">
                        <div className="truncate text-lg font-semibold">
                          {item.label || preset.defaultLabel}
                        </div>
                        <div
                          className="truncate text-sm text-muted-foreground"
                          title={item.url || "Ссылка не указана"}
                        >
                          {item.url || "Ссылка пока не указана"}
                        </div>
                        {item.description ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {placementLabels.length > 0 ? (
                          placementLabels.map((label) => <Pill key={label}>{label}</Pill>)
                        ) : (
                          <Pill>Не выводится</Pill>
                        )}
                        {item.openInNewTab ? <Pill>Новая вкладка</Pill> : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-black/10 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-none"
                      onClick={() => openEditDialog(item.id)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-none"
                      onClick={() => updateItem(item.id, { enabled: !item.enabled })}
                    >
                      {item.enabled ? (
                        <EyeOff className="mr-2 h-4 w-4" />
                      ) : (
                        <Eye className="mr-2 h-4 w-4" />
                      )}
                      {item.enabled ? "Скрыть" : "Показать"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-none"
                      onClick={() => moveItem(item.id, -1)}
                      disabled={index === 0}
                      aria-label="Поднять ссылку выше"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-none"
                      onClick={() => moveItem(item.id, 1)}
                      disabled={index === config.items.length - 1}
                      aria-label="Опустить ссылку ниже"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-none text-red-600 hover:text-red-600"
                      onClick={() => {
                        void handleRemoveItem(
                          item.id,
                          item.label || preset.defaultLabel,
                        );
                      }}
                      aria-label="Удалить ссылку"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent className="max-w-4xl overflow-y-auto p-0 sm:rounded-none">
          {draftItem ? (
            <div className="p-6">
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle>
                  {editingItemId ? "Редактирование ссылки" : "Новая ссылка"}
                </DialogTitle>
                <DialogDescription>
                  Изменения применяются сразу, без отдельной кнопки сохранения.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-6">
                <div className={boxClass}>
                  <div className="mb-4 text-sm font-semibold">Основная информация</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="social-preset">Площадка</Label>
                      <select
                        id="social-preset"
                        value={draftItem.presetId}
                        onChange={(event) =>
                          handleDraftPresetChange(
                            event.target.value as SiteSocialLinkPresetId,
                          )
                        }
                        className={selectClass}
                      >
                        {SITE_SOCIAL_LINK_PRESET_OPTIONS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="social-label">Название</Label>
                      <Input
                        id="social-label"
                        value={draftItem.label}
                        onChange={(event) =>
                          updateDraftItem({ label: event.target.value })
                        }
                        placeholder={
                          getSiteSocialLinkPreset(draftItem.presetId).defaultLabel
                        }
                        className="rounded-none"
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label htmlFor="social-url">Ссылка</Label>
                    <Input
                      id="social-url"
                      value={draftItem.url}
                      onChange={(event) =>
                        updateDraftItem({ url: event.target.value })
                      }
                      placeholder={
                        getSiteSocialLinkPreset(draftItem.presetId).urlPlaceholder
                      }
                      className="rounded-none"
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label htmlFor="social-description">Подпись или описание</Label>
                    <Textarea
                      id="social-description"
                      value={draftItem.description}
                      onChange={(event) =>
                        updateDraftItem({ description: event.target.value })
                      }
                      rows={3}
                      className="rounded-none"
                      placeholder="Например: новости, скидки, поддержка, видеоконтент"
                    />
                  </div>
                </div>

                <div className={boxClass}>
                  <div className="mb-4 text-sm font-semibold">Иконка и цвета</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="social-icon-mode">Источник иконки</Label>
                      <select
                        id="social-icon-mode"
                        value={draftItem.iconMode}
                        onChange={(event) =>
                          updateDraftItem({
                            iconMode:
                              event.target.value === "custom" ? "custom" : "preset",
                          })
                        }
                        className={selectClass}
                      >
                        <option value="preset">Предустановленная</option>
                        <option value="custom">Своя иконка</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="social-icon-key">Набор иконок</Label>
                      <select
                        id="social-icon-key"
                        value={draftItem.iconKey}
                        onChange={(event) =>
                          updateDraftItem({
                            iconKey: event.target.value as SiteSocialIconKey,
                          })
                        }
                        className={selectClass}
                        disabled={draftItem.iconMode !== "preset"}
                      >
                        {SITE_SOCIAL_ICON_OPTIONS.map((iconOption) => (
                          <option key={iconOption.id} value={iconOption.id}>
                            {iconOption.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {draftItem.iconMode === "custom" ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="social-custom-icon">URL своей иконки</Label>
                        <Input
                          id="social-custom-icon"
                          value={draftItem.customIconUrl}
                          onChange={(event) =>
                            updateDraftItem({ customIconUrl: event.target.value })
                          }
                          placeholder="https://cdn.example.com/social-icon.png"
                          className="rounded-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="social-custom-upload">Загрузка иконки</Label>
                        <Input
                          id="social-custom-upload"
                          type="file"
                          accept="image/*,.avif,.jfif,.webp,.png,.jpg,.jpeg,.gif"
                          onChange={(event) => {
                            void handleDraftFileUpload(event);
                          }}
                          className="rounded-none"
                        />
                        <div className="text-xs text-muted-foreground">
                          {uploadingItemId === draftItem.id
                            ? "Загружаем файл..."
                            : "Можно загрузить PNG, JPG, WEBP, GIF или вставить внешний URL."}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 border border-black/10 bg-stone-50 p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Предпросмотр иконки
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)]">
                      <div className="flex min-h-[120px] items-center justify-center border border-black/10 bg-white">
                        <SocialLinkIcon item={draftItem} className="h-14 w-14" />
                      </div>
                      <div className="space-y-3">
                        <div className="border border-black/10 bg-white p-3">
                          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            Хедер
                          </div>
                          <SocialLinksList items={[draftItem]} variant="header" />
                        </div>
                        <div className="border border-black/10 bg-black p-3 text-white">
                          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-white/60">
                            Футер
                          </div>
                          <SocialLinksList items={[draftItem]} variant="footer" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="social-background-mode">Фон иконки</Label>
                      <select
                        id="social-background-mode"
                        value={draftItem.backgroundMode}
                        onChange={(event) =>
                          updateDraftItem({
                            backgroundMode:
                              event.target.value === "custom"
                                ? "custom"
                                : event.target.value === "none"
                                  ? "none"
                                  : "standard",
                          })
                        }
                        className={selectClass}
                      >
                        <option value="standard">Стандартный</option>
                        <option value="custom">Свой цвет</option>
                        <option value="none">Без фона</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="social-background-picker">Цвет</Label>
                        <input
                          id="social-background-picker"
                          type="color"
                          value={draftItem.backgroundColor || "#111111"}
                          onChange={(event) =>
                            updateDraftItem({ backgroundColor: event.target.value })
                          }
                          className="h-11 w-full cursor-pointer rounded-none border border-black bg-white p-1"
                          disabled={draftItem.backgroundMode !== "custom"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="social-background-color">HEX</Label>
                        <Input
                          id="social-background-color"
                          value={draftItem.backgroundColor}
                          onChange={(event) =>
                            updateDraftItem({ backgroundColor: event.target.value })
                          }
                          placeholder="#111111"
                          disabled={draftItem.backgroundMode !== "custom"}
                          className="rounded-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="social-icon-color-mode">Цвет иконки</Label>
                      <select
                        id="social-icon-color-mode"
                        value={draftItem.iconColorMode}
                        onChange={(event) =>
                          updateDraftItem({
                            iconColorMode:
                              event.target.value === "custom" ? "custom" : "standard",
                          })
                        }
                        className={selectClass}
                        disabled={draftItem.iconMode !== "preset"}
                      >
                        <option value="standard">Стандартный</option>
                        <option value="custom">Свой цвет</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="social-icon-picker">Цвет</Label>
                        <input
                          id="social-icon-picker"
                          type="color"
                          value={draftItem.iconColor || "#ffffff"}
                          onChange={(event) =>
                            updateDraftItem({ iconColor: event.target.value })
                          }
                          className="h-11 w-full cursor-pointer rounded-none border border-black bg-white p-1"
                          disabled={
                            draftItem.iconMode !== "preset" ||
                            draftItem.iconColorMode !== "custom"
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="social-icon-color">HEX</Label>
                        <Input
                          id="social-icon-color"
                          value={draftItem.iconColor}
                          onChange={(event) =>
                            updateDraftItem({ iconColor: event.target.value })
                          }
                          placeholder="#ffffff"
                          disabled={
                            draftItem.iconMode !== "preset" ||
                            draftItem.iconColorMode !== "custom"
                          }
                          className="rounded-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className={boxClass}>
                    <div className="mb-4 text-sm font-semibold">Места вывода</div>
                    <div className="grid gap-3">
                      <label className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={draftItem.showInHeader}
                          onCheckedChange={(checked) =>
                            updateDraftItem({ showInHeader: checked === true })
                          }
                        />
                        Хедер
                      </label>
                      <label className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={draftItem.showInFooter}
                          onCheckedChange={(checked) =>
                            updateDraftItem({ showInFooter: checked === true })
                          }
                        />
                        Футер
                      </label>
                      <label className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={draftItem.showOnPage}
                          onCheckedChange={(checked) =>
                            updateDraftItem({ showOnPage: checked === true })
                          }
                        />
                        Страница соцсетей
                      </label>
                    </div>
                  </div>

                  <div className={boxClass}>
                    <div className="mb-4 text-sm font-semibold">Поведение</div>
                    <div className="grid gap-3">
                      <label className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={draftItem.enabled}
                          onCheckedChange={(checked) =>
                            updateDraftItem({ enabled: checked === true })
                          }
                        />
                        Показывать ссылку на сайте
                      </label>
                      <label className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={draftItem.openInNewTab}
                          onCheckedChange={(checked) =>
                            updateDraftItem({ openInNewTab: checked === true })
                          }
                        />
                        Открывать в новой вкладке
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6 border-t border-black/10 pt-4">
                {editingItemId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-none text-red-600 hover:text-red-600"
                    onClick={() => {
                      void handleRemoveItem(
                        editingItemId,
                        draftItem.label ||
                          getSiteSocialLinkPreset(draftItem.presetId).defaultLabel,
                      );
                    }}
                  >
                    Удалить ссылку
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="h-11 rounded-none"
                  onClick={closeEditor}
                >
                  Сохранить
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
