import { Link } from "react-router";
import { LogOut, Package, Settings2 } from "lucide-react";

import SocialLinksList from "@/components/social/SocialLinksList";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SiteSocialLinkItem } from "@/lib/social-links";

interface HeaderNavLink {
  name: string;
  path: string;
}

interface HeaderMobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navLinks: HeaderNavLink[];
  activePathname: string;
  isAuthenticated: boolean;
  userPrimaryLabel: string;
  userSecondaryLabel: string;
  socialLinks: SiteSocialLinkItem[];
  socialsPageEnabled: boolean;
  onSignOut: () => Promise<void>;
}

export default function HeaderMobileMenu({
  open,
  onOpenChange,
  navLinks,
  activePathname,
  isAuthenticated,
  userPrimaryLabel,
  userSecondaryLabel,
  socialLinks,
  socialsPageEnabled,
  onSignOut,
}: HeaderMobileMenuProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="border-r-border bg-background">
        <SheetHeader className="sr-only">
          <SheetTitle>Навигационное меню</SheetTitle>
          <SheetDescription>
            Основные разделы сайта и быстрые действия для аккаунта.
          </SheetDescription>
        </SheetHeader>
        <nav className="mt-10 flex flex-col gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-2xl font-bold transition-colors hover:text-muted-foreground ${
                activePathname === link.path
                  ? "underline decoration-2 underline-offset-4"
                  : ""
              }`}
              onClick={() => onOpenChange(false)}
            >
              {link.name}
            </Link>
          ))}

          {isAuthenticated ? (
            <>
              <div className="border-t border-border pt-6">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Аккаунт
                </p>
                <p className="mt-2 text-lg font-bold">{userPrimaryLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {userSecondaryLabel}
                </p>
              </div>
              <Link
                to="/profile?tab=settings"
                className="flex items-center gap-2 text-2xl font-bold transition-colors hover:text-muted-foreground"
                onClick={() => onOpenChange(false)}
              >
                <Settings2 className="h-6 w-6" />
                Профиль
              </Link>
              <Link
                to="/profile"
                className="flex items-center gap-2 text-2xl font-bold transition-colors hover:text-muted-foreground"
                onClick={() => onOpenChange(false)}
              >
                <Package className="h-6 w-6" />
                Заказы
              </Link>
              <button
                onClick={async () => {
                  await onSignOut();
                  onOpenChange(false);
                }}
                className="flex items-center gap-2 text-left text-2xl font-bold transition-colors hover:text-muted-foreground"
              >
                <LogOut className="h-6 w-6" />
                Выйти
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="text-2xl font-bold transition-colors hover:text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              Войти
            </Link>
          )}

          {(socialLinks.length > 0 || socialsPageEnabled) ? (
            <div className="border-t border-border pt-6">
              {socialsPageEnabled ? (
                <Link
                  to="/socials"
                  className={`text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-foreground ${
                    activePathname === "/socials" ? "text-foreground" : ""
                  }`}
                  onClick={() => onOpenChange(false)}
                >
                  Все соцсети
                </Link>
              ) : null}

              {socialLinks.length > 0 ? (
                <div className={socialsPageEnabled ? "mt-4" : ""}>
                  <SocialLinksList
                    items={socialLinks}
                    variant="header"
                    className="flex-wrap gap-3"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
