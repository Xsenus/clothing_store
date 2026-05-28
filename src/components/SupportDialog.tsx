import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const DEFAULT_SUPPORT_EMAIL = "fashiondemon.shop@internet.ru";
export const DEFAULT_SUPPORT_MESSAGE =
  "Если у вас возникли вопросы по заказу, оплате, доставке или возврату, напишите нам на почту fashiondemon.shop@internet.ru.";

interface SupportDialogProps {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  message?: string;
  email?: string;
  actionLabel?: string;
  mailSubject?: string;
  mailBody?: string;
}

const buildMailtoHref = (email: string, subject?: string, body?: string) => {
  const params = new URLSearchParams();
  if (subject?.trim()) params.set("subject", subject.trim());
  if (body?.trim()) params.set("body", body.trim());

  const query = params.toString();
  return `mailto:${email}${query ? `?${query}` : ""}`;
};

export default function SupportDialog({
  trigger,
  open,
  onOpenChange,
  title = "Поддержка",
  description = "Контакты службы поддержки FASHION_DEMON",
  message = DEFAULT_SUPPORT_MESSAGE,
  email = DEFAULT_SUPPORT_EMAIL,
  actionLabel,
  mailSubject,
  mailBody,
}: SupportDialogProps) {
  const safeEmail = email.trim() || DEFAULT_SUPPORT_EMAIL;
  const safeMessage = message.trim() || DEFAULT_SUPPORT_MESSAGE;
  const href = buildMailtoHref(safeEmail, mailSubject, mailBody);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="rounded-none border-black bg-white text-black sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase tracking-tight">
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <p className="whitespace-pre-line text-base leading-7 text-neutral-700">
            {safeMessage}
          </p>
          <a
            href={href}
            className="inline-flex min-h-11 items-center justify-center border border-black bg-black px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-white hover:text-black"
          >
            {actionLabel || safeEmail}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
