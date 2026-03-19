import { Loader2 } from "lucide-react";
import { getCachedPublicSettings } from "@/lib/site-settings";

const isLoadingAnimationEnabled = (value: unknown) => {
  if (typeof value !== "string") {
    return true;
  }

  return value.trim().toLowerCase() !== "false";
};

export default function LoadingSpinner({ className = "" }: { className?: string }) {
  const settings = typeof window !== "undefined" ? getCachedPublicSettings() : {};
  const animationEnabled = isLoadingAnimationEnabled(settings?.site_loading_animation_enabled);
  const siteTitle = String(settings?.site_title || "fashiondemon").trim() || "fashiondemon";

  if (!animationEnabled) {
    return (
      <div className={`flex items-center justify-center p-4 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center p-6 ${className}`}>
      <div className="site-loader-shell">
        <div className="site-loader-head">
          <span className="site-loader-kicker">loading</span>
          <span className="site-loader-title">{siteTitle}</span>
        </div>
        <div className="site-loader-line">
          <span className="site-loader-line-fill" />
        </div>
        <div className="site-loader-bars" aria-hidden="true">
          <span className="site-loader-bar" />
          <span className="site-loader-bar" />
          <span className="site-loader-bar" />
        </div>
      </div>
    </div>
  );
}
