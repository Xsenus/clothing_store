import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PUBLIC_OFFER } from '@/lib/legal-texts';
import { useEffect, useState } from 'react';
import { fetchPublicSettings } from '@/lib/site-settings';

export default function OfferPage() {
  const [text, setText] = useState(PUBLIC_OFFER);

  useEffect(() => {
    const load = async () => {
      const settings = await fetchPublicSettings();
      if (settings?.public_offer) {
        setText(settings.public_offer);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-24 max-w-4xl">
        <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-12 break-words [overflow-wrap:anywhere]">
          Публичная оферта
        </h1>
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted-foreground">
          {text}
        </div>
      </main>
      <Footer />
    </div>
  );
}
