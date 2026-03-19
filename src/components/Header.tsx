import { Link, useLocation, useNavigate } from 'react-router';
import { ShoppingBag, User, Menu, LogOut, Package, Settings2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCart } from '@/context/CartContext';
import { useAuth, useAuthActions } from '@/context/AuthContext';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { motion, AnimatePresence } from 'framer-motion';

const getUserPrimaryLabel = (user: { nickname?: string; name?: string; email?: string } | null) => {
  const nickname = String(user?.nickname || '').trim();
  if (nickname) {
    return nickname.startsWith('@') ? nickname : `@${nickname}`;
  }

  const name = String(user?.name || '').trim();
  if (name) {
    return name;
  }

  const email = String(user?.email || '').trim();
  if (email) {
    return email;
  }

  return 'МОЙ АККАУНТ';
};

const getUserCompactLabel = (user: { nickname?: string; name?: string; email?: string } | null) => {
  const nickname = String(user?.nickname || '').trim();
  if (nickname) {
    return nickname.startsWith('@') ? nickname : `@${nickname}`;
  }

  const name = String(user?.name || '').trim();
  if (name) {
    return name;
  }

  const email = String(user?.email || '').trim();
  if (email.includes('@')) {
    const localPart = email.split('@')[0]?.trim();
    if (localPart) {
      return localPart;
    }
  }

  if (email) {
    return email;
  }

  return 'Аккаунт';
};

const getUserSecondaryLabel = (user: { email?: string } | null, primaryLabel: string) => {
  const email = String(user?.email || '').trim();
  if (email && email !== primaryLabel) {
    return email;
  }

  return 'Личный кабинет';
};

export default function Header() {
  const { totalItems } = useCart();
  const { user, isAuthenticated } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const { signOut } = useAuthActions();
  const confirmAction = useConfirmDialog();

  const userPrimaryLabel = getUserPrimaryLabel(user);
  const userCompactLabel = getUserCompactLabel(user);
  const userSecondaryLabel = getUserSecondaryLabel(user, userPrimaryLabel);
  const shouldHideDesktopAccountTrigger = location.pathname === '/' && !isScrolled;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'ГЛАВНАЯ', path: '/' },
    { name: 'КАТАЛОГ', path: '/catalog' },
  ];

  const handleSignOut = async () => {
    const confirmed = await confirmAction({
      title: 'Выйти из аккаунта?',
      description: 'Текущая сессия будет завершена на этом устройстве.',
      confirmText: 'Выйти',
    });
    if (!confirmed) return false;

    await signOut();
    navigate('/', { replace: true });
    return true;
  };

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-background/80 backdrop-blur-md border-b' : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        {/* Mobile Menu */}
        <div className="md:hidden">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-background border-r-border">
              <nav className="flex flex-col gap-6 mt-10">
                {navLinks.map((link) => (
                  <Link 
                    key={link.path} 
                    to={link.path}
                    className={`text-2xl font-bold hover:text-muted-foreground transition-colors ${
                      location.pathname === link.path ? 'underline decoration-2 underline-offset-4' : ''
                    }`}
                    onClick={() => setIsOpen(false)}
                  >
                    {link.name}
                  </Link>
                ))}
                {isAuthenticated ? (
                  <>
                    <div className="border-t border-border pt-6">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Аккаунт</p>
                      <p className="mt-2 text-lg font-bold">{userPrimaryLabel}</p>
                      <p className="text-sm text-muted-foreground">{userSecondaryLabel}</p>
                    </div>
                    <Link 
                      to="/profile?tab=settings"
                      className="text-2xl font-bold hover:text-muted-foreground transition-colors flex items-center gap-2"
                      onClick={() => setIsOpen(false)}
                    >
                      <Settings2 className="h-6 w-6" />
                      ПРОФИЛЬ
                    </Link>
                    <Link 
                      to="/profile"
                      className="text-2xl font-bold hover:text-muted-foreground transition-colors flex items-center gap-2"
                      onClick={() => setIsOpen(false)}
                    >
                      <Package className="h-6 w-6" />
                      ЗАКАЗЫ
                    </Link>
                  <button 
                    onClick={async () => {
                      const signedOut = await handleSignOut();
                      if (signedOut) {
                        setIsOpen(false);
                      }
                    }}
                    className="text-2xl font-bold text-left hover:text-muted-foreground transition-colors flex items-center gap-2"
                  >
                    <LogOut className="h-6 w-6" />
                    ВЫЙТИ
                  </button>
                  </>
                ) : (
                  <Link 
                    to="/auth"
                    className="text-2xl font-bold hover:text-muted-foreground transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    ВОЙТИ
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* Logo */}
        <Link to="/" className="text-2xl md:text-3xl font-black tracking-tighter uppercase">
          FASHION_DEMON
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.path} 
              to={link.path}
              className={`text-sm font-bold tracking-widest hover:text-muted-foreground transition-colors ${
                location.pathname === link.path ? 'underline decoration-2 underline-offset-4' : ''
              }`}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden md:block">
            {isAuthenticated && !shouldHideDesktopAccountTrigger ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-auto rounded-full px-0 py-0 text-left hover:bg-transparent"
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
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  className="w-[292px] rounded-[24px] border border-black/8 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.14)]"
                >
                  <DropdownMenuLabel className="rounded-[18px] bg-stone-50 px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white">
                        <User className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[17px] font-semibold leading-none">
                          {userPrimaryLabel}
                        </div>
                        <div className="truncate pt-1.5 text-sm font-medium normal-case text-muted-foreground">
                          {userSecondaryLabel}
                        </div>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="mx-2 my-2 bg-black/8" />
                  <DropdownMenuItem
                    className="rounded-[16px] px-3 py-3 text-[15px] font-medium"
                    onSelect={() => navigate('/profile?tab=settings')}
                  >
                    <Settings2 className="mr-3 h-4 w-4" />
                    Профиль
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-[16px] px-3 py-3 text-[15px] font-medium"
                    onSelect={() => navigate('/profile')}
                  >
                    <Package className="mr-3 h-4 w-4" />
                    Заказы
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-2 my-2 bg-black/8" />
                  <DropdownMenuItem
                    className="rounded-[16px] px-3 py-3 text-[15px] font-medium text-red-600 focus:bg-red-50 focus:text-red-600"
                    onSelect={async (event) => {
                      event.preventDefault();
                      await handleSignOut();
                    }}
                  >
                    <LogOut className="mr-3 h-4 w-4" />
                    Выйти
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : !isAuthenticated ? (
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="font-bold">
                  ВОЙТИ
                </Button>
              </Link>
            ) : null}
          </div>
          
          <Link to="/cart" className="relative" id="cart-icon-target">
            <Button variant="ghost" size="icon">
              <ShoppingBag className="h-5 w-5" />
              <AnimatePresence>
                {totalItems > 0 && (
                  <motion.span 
                    key={totalItems}
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.3, 1] }}
                    exit={{ scale: 0 }}
                    transition={{ duration: 0.4 }}
                    className="absolute top-0 right-0 h-4 w-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center"
                  >
                    {totalItems}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
