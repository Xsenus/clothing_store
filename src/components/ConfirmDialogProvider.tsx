import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
const ConfirmDialogViewport = lazy(() => import("@/components/ConfirmDialogViewport"));

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

      {activeRequest ? (
        <Suspense fallback={null}>
          <ConfirmDialogViewport
            activeRequest={activeRequest}
            settleRequest={settleRequest}
          />
        </Suspense>
      ) : null}
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
