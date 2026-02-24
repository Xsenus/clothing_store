import { Link, useLocation } from 'react-router';
import { ShoppingBag, User, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useCart } from '@/context/CartContext';
import { useAuthActions, Authenticated, Unauthenticated } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function Header() {
  const { totalItems } = useCart();
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { signOut } = useAuthActions();

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
    await signOut();
    window.location.href = "/";
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
                <Authenticated>
                   <Link 
                    to="/profile"
                    className="text-2xl font-bold hover:text-muted-foreground transition-colors flex items-center gap-2"
                    onClick={() => setIsOpen(false)}
                  >
                    <User className="h-6 w-6" />
                    ПРОФИЛЬ
                  </Link>
                  <button 
                    onClick={() => {
                      handleSignOut();
                      setIsOpen(false);
                    }}
                    className="text-2xl font-bold text-left hover:text-muted-foreground transition-colors"
                  >
                    ВЫЙТИ
                  </button>
                </Authenticated>
                <Unauthenticated>
                  <Link 
                    to="/auth"
                    className="text-2xl font-bold hover:text-muted-foreground transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    ВОЙТИ
                  </Link>
                </Unauthenticated>
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
            <Authenticated>
              <Link to="/profile">
                <Button variant="ghost" size="icon">
                  <User className="h-5 w-5" />
                </Button>
              </Link>
            </Authenticated>
            <Unauthenticated>
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="font-bold">
                  ВОЙТИ
                </Button>
              </Link>
            </Unauthenticated>
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
