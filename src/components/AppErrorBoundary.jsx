import React, { useEffect } from "react";
import { useLocation } from "react-router";

import LoadingSpinner from "@/components/LoadingSpinner";
import {
  attemptChunkRecovery,
  isRecoverableChunkError,
} from "@/lib/chunk-recovery";

class AppErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      isRecovering: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Application render failed.", error, errorInfo);

    if (!isRecoverableChunkError(error)) {
      return;
    }

    const isRecovering = attemptChunkRecovery({
      error,
      source: "error-boundary",
    });

    if (isRecovering) {
      this.setState({ isRecovering: true });
    }
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.resetKey !== this.props.resetKey &&
      this.state.error &&
      !this.state.isRecovering
    ) {
      this.setState({
        error: null,
        isRecovering: false,
      });
    }
  }

  render() {
    if (this.state.isRecovering) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center text-foreground">
          <LoadingSpinner />
          <p className="mt-4 text-sm text-muted-foreground">
            Обновляем приложение, чтобы догрузить свежую версию страницы.
          </p>
        </div>
      );
    }

    if (this.state.error) {
      const isChunkError = isRecoverableChunkError(this.state.error);

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center text-foreground">
          <div className="max-w-md space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Application error
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                Не удалось открыть страницу
              </h1>
              <p className="text-sm text-muted-foreground">
                {isChunkError
                  ? "Похоже, приложение обновилось во время вашей сессии. Попробуйте перезагрузить страницу."
                  : "Во время перехода произошла ошибка. Попробуйте обновить страницу и открыть раздел еще раз."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AppErrorBoundary({ children }) {
  const location = useLocation();

  useEffect(() => {
    const recoverIfNeeded = (error, source, event) => {
      if (!isRecoverableChunkError(error)) {
        return;
      }

      event.preventDefault?.();
      attemptChunkRecovery({
        error,
        source,
      });
    };

    const handlePreloadError = (event) => {
      recoverIfNeeded(event?.payload ?? event?.error ?? null, "vite:preloadError", event);
    };

    const handleUnhandledRejection = (event) => {
      recoverIfNeeded(event?.reason ?? null, "unhandledrejection", event);
    };

    const handleWindowError = (event) => {
      recoverIfNeeded(event?.error ?? event?.message ?? null, "window:error", event);
    };

    window.addEventListener("vite:preloadError", handlePreloadError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleWindowError);

    return () => {
      window.removeEventListener("vite:preloadError", handlePreloadError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleWindowError);
    };
  }, []);

  return (
    <AppErrorBoundaryInner
      resetKey={`${location.pathname}${location.search}${location.hash}`}
    >
      {children}
    </AppErrorBoundaryInner>
  );
}
