import { Link } from 'react-router';

export default function Footer() {
  return (
    <footer className="bg-black text-white py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-black mb-4 tracking-tighter uppercase">FASHION_DEMON</h2>
            <p className="text-gray-400 max-w-sm mb-6">
              Переосмысляем уличную моду с смелой эстетикой и премиальным качеством. 
              Создано для тех, кто не боится выделяться.
            </p>
          </div>
          
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest mb-4">Магазин</h3>
            <ul className="space-y-2 text-gray-400">
              <li><Link to="/catalog" className="hover:text-white transition-colors">Все товары</Link></li>
              <li><Link to="/catalog?sort=new" className="hover:text-white transition-colors">Новинки</Link></li>
              <li><Link to="/catalog?sort=popular" className="hover:text-white transition-colors">В тренде</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest mb-4">Поддержка</h3>
            <ul className="space-y-2 text-gray-400">
              <li><Link to="/profile" className="hover:text-white transition-colors">Мой аккаунт</Link></li>
              <li><Link to="/cart" className="hover:text-white transition-colors">Корзина</Link></li>
              <li><Link to="/checkout" className="hover:text-white transition-colors">Доставка</Link></li>
              <li><Link to="/returns" className="hover:text-white transition-colors">Условия возврата</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-500 uppercase tracking-wider">
          <p className="text-center md:text-left">&copy; {new Date().getFullYear()} FASHION_DEMON. Все права защищены.</p>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-6 text-center md:text-left">
            <Link to="/privacy" className="hover:text-white transition-colors">Политика конфиденциальности</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Пользовательское соглашение</Link>
            <Link to="/offer" className="hover:text-white transition-colors">Публичная оферта</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
