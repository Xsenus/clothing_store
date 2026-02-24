import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PUBLIC_OFFER } from '@/lib/legal-texts';

export default function OfferPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-24 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-12">
          Публичная оферта
        </h1>
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {PUBLIC_OFFER}
        </div>
      </main>
      <Footer />
    </div>
  );
}
