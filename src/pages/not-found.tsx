import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageSeo from '@/components/PageSeo';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white text-center p-4">
      <PageSeo
        title="Страница не найдена"
        description="Страница не найдена на сайте fashiondemon."
        robots="noindex,nofollow"
      />
      <h1 className="text-9xl font-black mb-4">404</h1>
      <p className="text-2xl font-light uppercase tracking-widest mb-8">Страница не найдена</p>
      <Link to="/">
        <Button className="bg-white text-black hover:bg-gray-200 px-8 py-6 rounded-none font-bold uppercase tracking-widest">
          Вернуться на главную
        </Button>
      </Link>
    </div>
  );
}
