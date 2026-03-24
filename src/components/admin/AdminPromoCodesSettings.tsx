import { useEffect, useMemo, useState } from "react";

import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FLOW } from "@/lib/api-mapping";
import { formatProductPrice } from "@/lib/price-format";
import { toast } from "sonner";

interface AdminPromoCode {
  id: string;
  code: string;
  description?: string | null;
  discountType: "percent" | "fixed";
  discountValue: number;
  minimumSubtotal?: number | null;
  maximumDiscountAmount?: number | null;
  usageLimit?: number | null;
  usedCount: number;
  remainingUses?: number | null;
  isActive: boolean;
  startsAt?: number | null;
  expiresAt?: number | null;
}

interface PromoCodeFormState {
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  minimumSubtotal: string;
  maximumDiscountAmount: string;
  usageLimit: string;
  isActive: boolean;
  startsAt: string;
  expiresAt: string;
}

const INPUT_CLASS_NAME = "h-11 rounded-none";

const getEmptyPromoCodeForm = (): PromoCodeFormState => ({
  code: "",
  description: "",
  discountType: "percent",
  discountValue: "10",
  minimumSubtotal: "",
  maximumDiscountAmount: "",
  usageLimit: "",
  isActive: true,
  startsAt: "",
  expiresAt: "",
});

const toDateInputValue = (timestamp?: number | null) => {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toDateTimestamp = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const getLocalDateStart = (timestamp: number) => {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const formatPromoCodeDate = (timestamp?: number | null, fallback = "Без срока") => {
  if (!timestamp) {
    return fallback;
  }

  return new Date(timestamp).toLocaleDateString("ru-RU");
};

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalInteger = (value: string) => {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPromoCodeStatusLabel = (promoCode: AdminPromoCode) => {
  const now = getLocalDateStart(Date.now());
  if (!promoCode.isActive) {
    return "Отключен";
  }

  if (promoCode.startsAt && getLocalDateStart(promoCode.startsAt) > now) {
    return "Ждет старта";
  }

  if (promoCode.expiresAt && getLocalDateStart(promoCode.expiresAt) < now) {
    return "Истек";
  }

  if (promoCode.usageLimit && promoCode.usedCount >= promoCode.usageLimit) {
    return "Лимит исчерпан";
  }

  return "Активен";
};

const getPromoCodeDiscountLabel = (promoCode: AdminPromoCode) => {
  if (promoCode.discountType === "fixed") {
    return formatProductPrice(promoCode.discountValue);
  }

  const capLabel = promoCode.maximumDiscountAmount
    ? `, макс. ${formatProductPrice(promoCode.maximumDiscountAmount)}`
    : "";
  return `${promoCode.discountValue}%${capLabel}`;
};

const buildFormFromPromoCode = (promoCode: AdminPromoCode): PromoCodeFormState => ({
  code: promoCode.code,
  description: promoCode.description || "",
  discountType: promoCode.discountType,
  discountValue: String(promoCode.discountValue ?? ""),
  minimumSubtotal: promoCode.minimumSubtotal != null ? String(promoCode.minimumSubtotal) : "",
  maximumDiscountAmount: promoCode.maximumDiscountAmount != null ? String(promoCode.maximumDiscountAmount) : "",
  usageLimit: promoCode.usageLimit != null ? String(promoCode.usageLimit) : "",
  isActive: promoCode.isActive,
  startsAt: toDateInputValue(promoCode.startsAt),
  expiresAt: toDateInputValue(promoCode.expiresAt),
});

export default function AdminPromoCodesSettings() {
  const confirmAction = useConfirmDialog();
  const [promoCodes, setPromoCodes] = useState<AdminPromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPromoCodeId, setEditingPromoCodeId] = useState<string | null>(null);
  const [form, setForm] = useState<PromoCodeFormState>(getEmptyPromoCodeForm);

  const isEditing = Boolean(editingPromoCodeId);

  const activePromoCodesCount = useMemo(
    () => promoCodes.filter((promoCode) => getPromoCodeStatusLabel(promoCode) === "Активен").length,
    [promoCodes],
  );

  const loadPromoCodes = async () => {
    setLoading(true);

    try {
      const result = await FLOW.adminGetPromoCodes();
      setPromoCodes(Array.isArray(result) ? result : []);
    } catch (error) {
      toast.error((error as Error)?.message || "Не удалось загрузить промокоды");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPromoCodes();
  }, []);

  const closeEditorModal = () => {
    setIsEditorOpen(false);
    setEditingPromoCodeId(null);
    setForm(getEmptyPromoCodeForm());
  };

  const openCreateModal = () => {
    setEditingPromoCodeId(null);
    setForm(getEmptyPromoCodeForm());
    setIsEditorOpen(true);
  };

  const startEditPromoCode = (promoCode: AdminPromoCode) => {
    setEditingPromoCodeId(promoCode.id);
    setForm(buildFormFromPromoCode(promoCode));
    setIsEditorOpen(true);
  };

  const savePromoCode = async () => {
    const normalizedCode = form.code.trim().toUpperCase();
    const discountValue = parseOptionalNumber(form.discountValue);
    const minimumSubtotal = parseOptionalNumber(form.minimumSubtotal);
    const maximumDiscountAmount = parseOptionalNumber(form.maximumDiscountAmount);
    const usageLimit = parseOptionalInteger(form.usageLimit);

    if (!normalizedCode) {
      toast.error("Введите код промокода");
      return;
    }

    if (!discountValue || discountValue <= 0) {
      toast.error("Укажите корректный размер скидки");
      return;
    }

    if (form.discountType === "percent" && discountValue > 100) {
      toast.error("Скидка в процентах не может быть больше 100");
      return;
    }

    if (minimumSubtotal !== null && minimumSubtotal < 0) {
      toast.error("Минимальная сумма заказа не может быть отрицательной");
      return;
    }

    if (maximumDiscountAmount !== null && maximumDiscountAmount <= 0) {
      toast.error("Максимальная скидка должна быть больше нуля");
      return;
    }

    if (usageLimit !== null && usageLimit <= 0) {
      toast.error("Лимит использований должен быть больше нуля");
      return;
    }

    const payload = {
      code: normalizedCode,
      description: form.description.trim() || null,
      discountType: form.discountType,
      discountValue,
      minimumSubtotal,
      maximumDiscountAmount: form.discountType === "percent" ? maximumDiscountAmount : null,
      usageLimit,
      isActive: form.isActive,
      startsAt: toDateTimestamp(form.startsAt),
      expiresAt: toDateTimestamp(form.expiresAt),
    };

    setSubmitting(true);

    try {
      if (editingPromoCodeId) {
        await FLOW.adminUpdatePromoCode({
          input: {
            id: editingPromoCodeId,
            payload,
          },
        });
        toast.success("Промокод обновлен");
      } else {
        await FLOW.adminCreatePromoCode({ input: payload });
        toast.success("Промокод создан");
      }

      await loadPromoCodes();
      closeEditorModal();
    } catch (error) {
      toast.error((error as Error)?.message || "Не удалось сохранить промокод");
    } finally {
      setSubmitting(false);
    }
  };

  const deletePromoCode = async (promoCode: AdminPromoCode) => {
    const confirmed = await confirmAction({
      title: "Удалить промокод?",
      description: `Код ${promoCode.code} будет удален без возможности восстановления.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      variant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    try {
      await FLOW.adminDeletePromoCode({ input: { id: promoCode.id } });
      toast.success("Промокод удален");
      await loadPromoCodes();
      if (editingPromoCodeId === promoCode.id) {
        closeEditorModal();
      }
    } catch (error) {
      toast.error((error as Error)?.message || "Не удалось удалить промокод");
    }
  };

  return (
    <>
      <div className="space-y-4 border p-3">
        <div className="space-y-1">
          <h3 className="font-semibold">Промокоды</h3>
          <p className="text-sm text-muted-foreground">
            Здесь можно создавать коды на фиксированную скидку или процент, ограничивать их по сумме заказа, сроку действия и числу использований.
          </p>
        </div>

        <div className="space-y-4 rounded-none border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Список промокодов</div>
              <div className="text-xs text-muted-foreground">
                Всего: {promoCodes.length} · активных сейчас: {activePromoCodesCount}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="rounded-none" onClick={openCreateModal}>
                Создать промокод
              </Button>
              <Button type="button" variant="outline" className="rounded-none" onClick={loadPromoCodes} disabled={loading}>
                {loading ? "Обновляем..." : "Обновить"}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Загружаем промокоды...</div>
          ) : promoCodes.length === 0 ? (
            <div className="rounded-none border border-dashed border-gray-300 p-6 text-sm text-muted-foreground">
              Пока нет ни одного промокода.
            </div>
          ) : (
            <div className="grid gap-3">
              {promoCodes.map((promoCode) => (
                <div key={promoCode.id} className="rounded-none border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-bold">{promoCode.code}</span>
                        <span className="inline-flex rounded-none border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {getPromoCodeStatusLabel(promoCode)}
                        </span>
                      </div>
                      {promoCode.description ? (
                        <p className="text-sm text-muted-foreground">{promoCode.description}</p>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="rounded-none" onClick={() => startEditPromoCode(promoCode)}>
                        Редактировать
                      </Button>
                      <Button type="button" variant="outline" className="rounded-none text-red-600" onClick={() => deletePromoCode(promoCode)}>
                        Удалить
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Скидка</div>
                      <div className="font-medium">{getPromoCodeDiscountLabel(promoCode)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Мин. заказ</div>
                      <div className="font-medium">
                        {promoCode.minimumSubtotal != null ? formatProductPrice(promoCode.minimumSubtotal) : "Без порога"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Использований</div>
                      <div className="font-medium">
                        {promoCode.usedCount}
                        {promoCode.usageLimit != null ? ` / ${promoCode.usageLimit}` : ""}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Период</div>
                      <div className="font-medium">
                        {formatPromoCodeDate(promoCode.startsAt, "Сейчас")}
                        {" — "}
                        {formatPromoCodeDate(promoCode.expiresAt, "Без срока")}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          if (submitting) {
            return;
          }

          if (open) {
            setIsEditorOpen(true);
            return;
          }

          closeEditorModal();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-none border-black">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-wide">
              {isEditing ? "Редактирование промокода" : "Новый промокод"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Код применяется на checkout и проверяется сервером перед созданием заказа.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="promo-code-code">Код</Label>
                <Input
                  id="promo-code-code"
                  value={form.code}
                  onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                  placeholder="WELCOME10"
                  className={INPUT_CLASS_NAME}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="promo-code-description">Описание</Label>
                <Textarea
                  id="promo-code-description"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="min-h-[88px] rounded-none"
                  placeholder="Например: скидка для первого заказа"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="promo-code-discount-type">Тип скидки</Label>
                  <Select
                    value={form.discountType}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, discountType: value as "percent" | "fixed" }))}
                  >
                    <SelectTrigger id="promo-code-discount-type" className={INPUT_CLASS_NAME}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Процент</SelectItem>
                      <SelectItem value="fixed">Фиксированная</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="promo-code-discount-value">
                    {form.discountType === "percent" ? "Скидка, %" : "Скидка, ₽"}
                  </Label>
                  <Input
                    id="promo-code-discount-value"
                    value={form.discountValue}
                    onChange={(event) => setForm((prev) => ({ ...prev, discountValue: event.target.value }))}
                    inputMode="decimal"
                    className={INPUT_CLASS_NAME}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="promo-code-min-subtotal">Мин. сумма заказа</Label>
                  <Input
                    id="promo-code-min-subtotal"
                    value={form.minimumSubtotal}
                    onChange={(event) => setForm((prev) => ({ ...prev, minimumSubtotal: event.target.value }))}
                    inputMode="decimal"
                    placeholder="Не ограничено"
                    className={INPUT_CLASS_NAME}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="promo-code-usage-limit">Лимит использований</Label>
                  <Input
                    id="promo-code-usage-limit"
                    value={form.usageLimit}
                    onChange={(event) => setForm((prev) => ({ ...prev, usageLimit: event.target.value }))}
                    inputMode="numeric"
                    placeholder="Без лимита"
                    className={INPUT_CLASS_NAME}
                  />
                </div>
              </div>

              {form.discountType === "percent" && (
                <div className="space-y-1">
                  <Label htmlFor="promo-code-max-discount">Макс. скидка, ₽</Label>
                  <Input
                    id="promo-code-max-discount"
                    value={form.maximumDiscountAmount}
                    onChange={(event) => setForm((prev) => ({ ...prev, maximumDiscountAmount: event.target.value }))}
                    inputMode="decimal"
                    placeholder="Например: 1000"
                    className={INPUT_CLASS_NAME}
                  />
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="promo-code-starts-at">Начало действия</Label>
                  <Input
                    id="promo-code-starts-at"
                    type="date"
                    value={form.startsAt}
                    onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
                    className={INPUT_CLASS_NAME}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="promo-code-expires-at">Окончание действия</Label>
                  <Input
                    id="promo-code-expires-at"
                    type="date"
                    value={form.expiresAt}
                    onChange={(event) => setForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
                    className={INPUT_CLASS_NAME}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: Boolean(checked) }))}
                />
                <span>Промокод активен</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-none" onClick={closeEditorModal} disabled={submitting}>
              Отмена
            </Button>
            <Button type="button" className="rounded-none" onClick={savePromoCode} disabled={submitting}>
              {submitting ? "Сохраняем..." : isEditing ? "Сохранить изменения" : "Создать промокод"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
