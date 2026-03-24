import { Link } from "react-router";
import { LogOut, Package, Settings2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
  onSignOut,
}: HeaderMobileMenuProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="bg-background border-r-border">
        <SheetHeader className="sr-only">
          <SheetTitle>Навигационное меню</SheetTitle>
          <SheetDescription>
            Основные разделы сайта и быстрые действия для аккаунта.
          </SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-6 mt-10">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-2xl font-bold hover:text-muted-foreground transition-colors ${
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
                className="text-2xl font-bold hover:text-muted-foreground transition-colors flex items-center gap-2"
                onClick={() => onOpenChange(false)}
              >
                <Settings2 className="h-6 w-6" />
                Профиль
              </Link>
              <Link
                to="/profile"
                className="text-2xl font-bold hover:text-muted-foreground transition-colors flex items-center gap-2"
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
                className="text-2xl font-bold text-left hover:text-muted-foreground transition-colors flex items-center gap-2"
              >
                <LogOut className="h-6 w-6" />
                Выйти
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="text-2xl font-bold hover:text-muted-foreground transition-colors"
              onClick={() => onOpenChange(false)}
            >
              Войти
            </Link>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
