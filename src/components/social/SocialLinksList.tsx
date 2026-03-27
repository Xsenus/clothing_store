import type { MouseEvent } from "react";
import { ArrowUpRight } from "lucide-react";

import SocialLinkIcon from "@/components/social/SocialLinkIcon";
import {
  formatSiteSocialLinkDisplayUrl,
  shouldOpenSiteSocialLinkInNewTab,
  type SiteSocialLinkItem,
} from "@/lib/social-links";
import { cn } from "@/lib/utils";

interface SocialLinksListProps {
  items: SiteSocialLinkItem[];
  variant?: "header" | "footer" | "page";
  className?: string;
  maxItems?: number;
}

const getLinkProps = (item: SiteSocialLinkItem) => {
  const openInNewTab = shouldOpenSiteSocialLinkInNewTab(item);
  return {
    href: item.url.trim() || "#",
    target: openInNewTab ? "_blank" : undefined,
    rel: openInNewTab ? "noreferrer noopener" : undefined,
    onClick: !item.url.trim()
      ? (event: MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
        }
      : undefined,
  };
};

export default function SocialLinksList({
  items,
  variant = "footer",
  className,
  maxItems,
}: SocialLinksListProps) {
  const visibleItems =
    typeof maxItems === "number" ? items.slice(0, maxItems) : items;

  if (visibleItems.length === 0) {
    return null;
  }

  if (variant === "header") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {visibleItems.map((item) => (
          <a
            key={item.id}
            aria-label={item.label}
            title={item.label}
            className="transition-transform hover:-translate-y-0.5"
            {...getLinkProps(item)}
          >
            <SocialLinkIcon item={item} className="h-9 w-9 shadow-sm" />
          </a>
        ))}
      </div>
    );
  }

  if (variant === "page") {
    return (
      <div className={cn("grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
        {visibleItems.map((item) => (
          <a
            key={item.id}
            className="group flex h-full min-h-[220px] flex-col justify-between border border-black/10 bg-white p-5 transition-all hover:-translate-y-1 hover:border-black hover:shadow-[0_20px_45px_rgba(15,23,42,0.08)]"
            {...getLinkProps(item)}
          >
            <div className="space-y-4">
              <SocialLinkIcon item={item} className="h-12 w-12" />
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-black uppercase tracking-[0.08em]">
                    {item.label}
                  </h2>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-black/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.description || formatSiteSocialLinkDisplayUrl(item.url)}
                </p>
              </div>
            </div>
            <div className="pt-4 text-xs uppercase tracking-[0.16em] text-black/50">
              Перейти
            </div>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {visibleItems.map((item) => (
        <a
          key={item.id}
          className="group inline-flex min-h-[72px] items-center gap-3 border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition-all hover:border-white/40 hover:bg-white/10"
          {...getLinkProps(item)}
        >
          <SocialLinkIcon item={item} className="h-9 w-9" />
          <div className="min-w-0">
            <div className="font-semibold">{item.label}</div>
            <div className="truncate text-xs text-white/60">
              {item.description || formatSiteSocialLinkDisplayUrl(item.url)}
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-white/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/80" />
        </a>
      ))}
    </div>
  );
}
