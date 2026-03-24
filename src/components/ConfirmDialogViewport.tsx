import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type ConfirmDialogVariant = "default" | "destructive";

interface ActiveRequest {
  id: number;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmDialogVariant;
}

interface ConfirmDialogViewportProps {
  activeRequest: ActiveRequest | null;
  settleRequest: (requestId: number | undefined, result: boolean) => void;
}

export default function ConfirmDialogViewport({
  activeRequest,
  settleRequest,
}: ConfirmDialogViewportProps) {
  return (
    <AlertDialog
      open={Boolean(activeRequest)}
      onOpenChange={(open) => {
        if (!open) {
          settleRequest(activeRequest?.id, false);
        }
      }}
    >
      <AlertDialogContent className="rounded-none border-black">
        <AlertDialogHeader className="space-y-3">
          <AlertDialogTitle className="text-xl font-black uppercase tracking-wide">
            {activeRequest?.title || "Подтвердите действие"}
          </AlertDialogTitle>
          {activeRequest?.description ? (
            <AlertDialogDescription className="text-sm leading-6 text-muted-foreground">
              {activeRequest.description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-none border-black">
            {activeRequest?.cancelText || "Отмена"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              "rounded-none",
              activeRequest?.variant === "destructive" &&
                "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
            )}
            onClick={() => settleRequest(activeRequest?.id, true)}
          >
            {activeRequest?.confirmText || "Подтвердить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
