import type { CSSProperties } from "react";
import {
  AtSign,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  Pin,
  Play,
  Send,
  Twitter,
  Youtube,
  type LucideIcon,
} from "lucide-react";

import { toAbsoluteMediaUrl } from "@/lib/public-http";
import {
  getSiteSocialLinkVisuals,
  type SiteSocialIconKey,
  type SiteSocialLinkItem,
} from "@/lib/social-links";
import { cn } from "@/lib/utils";

interface SocialLinkIconProps {
  item: SiteSocialLinkItem;
  className?: string;
  imageClassName?: string;
}

const iconMap: Partial<Record<SiteSocialIconKey, LucideIcon>> = {
  instagram: Instagram,
  telegram: Send,
  youtube: Youtube,
  whatsapp: MessageCircle,
  facebook: Facebook,
  x: Twitter,
  linkedin: Linkedin,
  pinterest: Pin,
  mail: Mail,
  phone: Phone,
  globe: Globe,
  message: MessagesSquare,
  play: Play,
  "at-sign": AtSign,
};

const textIconMap: Partial<Record<SiteSocialIconKey, string>> = {
  vk: "VK",
  tiktok: "TT",
  rutube: "RT",
  dzen: "D",
};

export default function SocialLinkIcon({
  item,
  className,
  imageClassName,
}: SocialLinkIconProps) {
  const visuals = getSiteSocialLinkVisuals(item);
  const style: CSSProperties = visuals.showBackground
    ? {
        backgroundColor: visuals.backgroundColor,
        color: visuals.iconColor,
      }
    : {
        color: visuals.iconColor,
        borderColor: visuals.outlineColor,
      };
  const customIconUrl =
    item.iconMode === "custom" ? toAbsoluteMediaUrl(item.customIconUrl) : "";
  const IconComponent = item.iconMode === "preset" ? iconMap[item.iconKey] : null;
  const textIcon = item.iconMode === "preset" ? textIconMap[item.iconKey] : "";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border text-current",
        visuals.showBackground ? "border-transparent" : "bg-transparent",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      {customIconUrl ? (
        <img
          src={customIconUrl}
          alt=""
          className={cn("h-1/2 w-1/2 object-contain", imageClassName)}
        />
      ) : IconComponent ? (
        <IconComponent className={cn("h-1/2 w-1/2", imageClassName)} strokeWidth={2.1} />
      ) : textIcon ? (
        <span className="text-[0.52em] font-black uppercase tracking-tight">
          {textIcon}
        </span>
      ) : (
        <Globe className={cn("h-1/2 w-1/2", imageClassName)} strokeWidth={2.1} />
      )}
    </span>
  );
}
