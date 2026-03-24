import { Link } from "react-router";

export default function Footer() {
  return (
    <footer className="bg-black py-12 text-white md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 md:gap-12">
          <div className="md:col-span-2">
            <h2 className="mb-4 text-2xl font-black uppercase tracking-tighter">
              FASHION_DEMON
            </h2>
            <p className="mb-6 max-w-sm text-gray-300">
              Переосмысляем уличную моду с смелой эстетикой и премиальным
              качеством. Создано для тех, кто не боится выделяться.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-widest">
              Магазин
            </h3>
            <ul className="space-y-2 text-gray-300">
              <li>
                <Link
                  to="/catalog"
                  className="transition-colors hover:text-white"
                >
                  Все товары
                </Link>
              </li>
              <li>
                <Link
                  to="/catalog?sort=new"
                  className="transition-colors hover:text-white"
                >
                  Новинки
                </Link>
              </li>
              <li>
                <Link
                  to="/catalog?sort=popular"
                  className="transition-colors hover:text-white"
                >
                  В тренде
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-widest">
              Поддержка
            </h3>
            <ul className="space-y-2 text-gray-300">
              <li>
                <Link
                  to="/profile"
                  className="transition-colors hover:text-white"
                >
                  Мой аккаунт
                </Link>
              </li>
              <li>
                <Link to="/cart" className="transition-colors hover:text-white">
                  Корзина
                </Link>
              </li>
              <li>
                <Link
                  to="/returns"
                  className="transition-colors hover:text-white"
                >
                  Условия возврата
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-800 pt-8 text-xs uppercase tracking-wider text-gray-400 md:flex-row">
          <p className="text-center md:text-left">
            &copy; {new Date().getFullYear()} FASHION_DEMON. Все права защищены.
          </p>
          <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-6 md:text-left">
            <Link to="/privacy" className="transition-colors hover:text-white">
              Политика конфиденциальности
            </Link>
            <Link to="/terms" className="transition-colors hover:text-white">
              Пользовательское соглашение
            </Link>
            <Link to="/offer" className="transition-colors hover:text-white">
              Публичная оферта
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
