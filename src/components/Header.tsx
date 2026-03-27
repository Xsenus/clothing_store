import { useEffect, useState, type ComponentType } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Menu, ShoppingBag, User } from "lucide-react";

import SocialLinksList from "@/components/social/SocialLinksList";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { useAuth, useAuthActions } from "@/context/AuthContext";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import useSiteSocialLinks from "@/hooks/useSiteSocialLinks";
import type { SiteSocialLinkItem } from "@/lib/social-links";
import { cn } from "@/lib/utils";

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

interface HeaderAccountMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userPrimaryLabel: string;
  userCompactLabel: string;
  userSecondaryLabel: string;
  onSignOut: () => Promise<void>;
}

const getUserPrimaryLabel = (
  user: { nickname?: string; name?: string; email?: string } | null,
) => {
  const nickname = String(user?.nickname || "").trim();
  if (nickname) {
    return nickname.startsWith("@") ? nickname : `@${nickname}`;
  }

  const name = String(user?.name || "").trim();
  if (name) {
    return name;
  }

  const email = String(user?.email || "").trim();
  if (email) {
    return email;
  }

  return "МОЙ АККАУНТ";
};

const getUserCompactLabel = (
  user: { nickname?: string; name?: string; email?: string } | null,
) => {
  const nickname = String(user?.nickname || "").trim();
  if (nickname) {
    return nickname.startsWith("@") ? nickname : `@${nickname}`;
  }

  const name = String(user?.name || "").trim();
  if (name) {
    return name;
  }

  const email = String(user?.email || "").trim();
  if (email.includes("@")) {
    const localPart = email.split("@")[0]?.trim();
    if (localPart) {
      return localPart;
    }
  }

  if (email) {
    return email;
  }

  return "Аккаунт";
};

const getUserSecondaryLabel = (
  user: { email?: string } | null,
  primaryLabel: string,
) => {
  const email = String(user?.email || "").trim();
  if (email && email !== primaryLabel) {
    return email;
  }

  return "Личный кабинет";
};

const loadHeaderMobileMenu = () => import("@/components/HeaderMobileMenu");
const loadHeaderAccountMenu = () => import("@/components/HeaderAccountMenu");

export default function Header() {
  const { totalItems } = useCart();
  const { user, isAuthenticated } = useAuth();
  const { signOut } = useAuthActions();
  const confirmAction = useConfirmDialog();
  const { headerLinks, pageLinks } = useSiteSocialLinks();
  const location = useLocation();
  const navigate = useNavigate();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [MobileMenuComponent, setMobileMenuComponent] =
    useState<ComponentType<HeaderMobileMenuProps> | null>(null);
  const [AccountMenuComponent, setAccountMenuComponent] =
    useState<ComponentType<HeaderAccountMenuProps> | null>(null);

  const userPrimaryLabel = getUserPrimaryLabel(user);
  const userCompactLabel = getUserCompactLabel(user);
  const userSecondaryLabel = getUserSecondaryLabel(user, userPrimaryLabel);
  const isHeroHeader = location.pathname === "/" && !isScrolled;
  const shouldHideDesktopAccountTrigger = isHeroHeader;
  const cartLabel =
    totalItems > 0 ? `Корзина, товаров: ${totalItems}` : "Корзина";
  const navLinks = [
    { name: "ГЛАВНАЯ", path: "/" },
    { name: "КАТАЛОГ", path: "/catalog" },
  ];
  const headerSocialLinks = headerLinks.slice(0, 4);
  const socialsPageEnabled = pageLinks.length > 0;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSignOut = async () => {
    const confirmed = await confirmAction({
      title: "Выйти из аккаунта?",
      description:
        "Текущая сессия будет завершена на этом устройстве.",
      confirmText: "Выйти",
    });
    if (!confirmed) return;

    await signOut();
    navigate("/", { replace: true });
  };

  const ensureMobileMenuLoaded = async () => {
    if (MobileMenuComponent) {
      return MobileMenuComponent;
    }

    const module = await loadHeaderMobileMenu();
    setMobileMenuComponent(() => module.default);
    return module.default;
  };

  const ensureAccountMenuLoaded = async () => {
    if (AccountMenuComponent) {
      return AccountMenuComponent;
    }

    const module = await loadHeaderAccountMenu();
    setAccountMenuComponent(() => module.default);
    return module.default;
  };

  const openMobileMenu = async () => {
    await ensureMobileMenuLoaded();
    setIsMobileMenuOpen(true);
  };

  const openAccountMenu = async () => {
    await ensureAccountMenuLoaded();
    setIsAccountMenuOpen(true);
  };

  return (
    <header
      data-hero-header={isHeroHeader ? "true" : "false"}
      className={cn(
        "fixed left-0 right-0 top-0 z-50 text-foreground transition-all duration-300",
        isScrolled ? "border-b bg-background/80 backdrop-blur-md" : "bg-transparent",
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:grid md:h-20 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <div className="md:hidden">
          {MobileMenuComponent ? (
            <MobileMenuComponent
              open={isMobileMenuOpen}
              onOpenChange={setIsMobileMenuOpen}
              navLinks={navLinks}
              activePathname={location.pathname}
              isAuthenticated={isAuthenticated}
              userPrimaryLabel={userPrimaryLabel}
              userSecondaryLabel={userSecondaryLabel}
              socialLinks={headerLinks}
              socialsPageEnabled={socialsPageEnabled}
              onSignOut={handleSignOut}
            />
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="site-header-menu-button"
            aria-label="Открыть меню"
            title="Открыть меню"
            onMouseEnter={() => {
              void ensureMobileMenuLoaded();
            }}
            onFocus={() => {
              void ensureMobileMenuLoaded();
            }}
            onClick={() => {
              void openMobileMenu();
            }}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>

        <Link
          to="/"
          className="site-header-brand max-w-[calc(100vw-7.5rem)] truncate text-lg font-black uppercase leading-none tracking-tighter sm:text-xl md:max-w-full md:justify-self-start md:text-3xl"
        >
          FASHION_DEMON
        </Link>

        <nav className="hidden items-center gap-8 md:flex md:justify-self-center">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`site-header-nav-link text-sm font-bold tracking-widest transition-colors hover:text-muted-foreground ${
                location.pathname === link.path
                  ? "underline decoration-2 underline-offset-4"
                  : ""
              }`}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:justify-self-end md:gap-4">
          {headerSocialLinks.length > 0 ? (
            <div className="hidden sm:flex">
              <SocialLinksList items={headerSocialLinks} variant="header" />
            </div>
          ) : null}

          <div className="hidden md:block">
            {isAuthenticated && !shouldHideDesktopAccountTrigger ? (
              <>
                {AccountMenuComponent ? (
                  <AccountMenuComponent
                    open={isAccountMenuOpen}
                    onOpenChange={setIsAccountMenuOpen}
                    userPrimaryLabel={userPrimaryLabel}
                    userCompactLabel={userCompactLabel}
                    userSecondaryLabel={userSecondaryLabel}
                    onSignOut={handleSignOut}
                  />
                ) : (
                  <Button
                    variant="ghost"
                    className="h-auto rounded-full px-0 py-0 text-left hover:bg-transparent"
                    onMouseEnter={() => {
                      void ensureAccountMenuLoaded();
                    }}
                    onFocus={() => {
                      void ensureAccountMenuLoaded();
                    }}
                    onClick={() => {
                      void openAccountMenu();
                    }}
                  >
                    <div className="flex items-center gap-3 rounded-full px-1 py-1 transition-colors hover:bg-black/[0.035]">
                      <div className="max-w-[126px] text-right leading-tight">
                        <div
                          className="truncate text-[15px] font-semibold tracking-[0.01em]"
                          title={userPrimaryLabel}
                        >
                          {userCompactLabel}
                        </div>
                      </div>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.08)]">
                        <User className="h-5 w-5" />
                      </span>
                    </div>
                  </Button>
                )}
              </>
            ) : !isAuthenticated ? (
              <Button asChild variant="ghost" size="sm" className="site-header-auth-button font-bold">
                <Link to="/auth" aria-label="Войти в аккаунт">
                  Войти
                </Link>
              </Button>
            ) : null}
          </div>

          <Button asChild variant="ghost" size="icon" className="site-header-cart-button relative">
            <Link
              to="/cart"
              id="cart-icon-target"
              aria-label={cartLabel}
              title={cartLabel}
            >
              <ShoppingBag className="h-5 w-5" />
              {totalItems > 0 && (
                <span
                  key={totalItems}
                  className="site-cart-badge-pop site-header-cart-badge absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                  aria-hidden="true"
                >
                  {totalItems}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
