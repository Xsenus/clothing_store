import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmDialogVariant;
}

interface ConfirmDialogRequest extends ConfirmDialogOptions {
  id: number;
  resolve: (result: boolean) => void;
}

type ConfirmDialogHandler = (options: ConfirmDialogOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmDialogHandler | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const queueRef = useRef<ConfirmDialogRequest[]>([]);
  const requestIdRef = useRef(0);
  const settledRequestIdsRef = useRef<Set<number>>(new Set());
  const [activeRequest, setActiveRequest] = useState<ConfirmDialogRequest | null>(null);

  useEffect(() => {
    if (activeRequest || queueRef.current.length === 0) {
      return;
    }

    setActiveRequest(queueRef.current.shift() ?? null);
  }, [activeRequest]);

  const settleRequest = useCallback((requestId: number | undefined, result: boolean) => {
    if (!requestId) {
      return;
    }

    setActiveRequest((current) => {
      if (!current || current.id !== requestId) {
        return current;
      }

      if (!settledRequestIdsRef.current.has(requestId)) {
        settledRequestIdsRef.current.add(requestId);
        current.resolve(result);
      }

      return null;
    });
  }, []);

  const confirm = useCallback<ConfirmDialogHandler>((options) => {
    return new Promise<boolean>((resolve) => {
      const request: ConfirmDialogRequest = {
        id: ++requestIdRef.current,
        title: options.title,
        description: options.description,
        confirmText: options.confirmText || "Подтвердить",
        cancelText: options.cancelText || "Отмена",
        variant: options.variant || "default",
        resolve,
      };

      queueRef.current.push(request);
      setActiveRequest((current) => current ?? queueRef.current.shift() ?? null);
    });
  }, []);

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}

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
                activeRequest?.variant === "destructive" && "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
              )}
              onClick={() => settleRequest(activeRequest?.id, true)}
            >
              {activeRequest?.confirmText || "Подтвердить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);

  if (!context) {
    throw new Error("useConfirmDialog must be used within ConfirmDialogProvider");
  }

  return context;
}
