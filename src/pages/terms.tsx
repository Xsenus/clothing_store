import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { USER_AGREEMENT } from '@/lib/legal-texts';
import { useEffect, useState } from 'react';
import { fetchPublicSettings } from '@/lib/site-settings';

export default function TermsPage() {
  const [text, setText] = useState(USER_AGREEMENT);

  useEffect(() => {
    const load = async () => {
      const settings = await fetchPublicSettings();
      if (settings?.user_agreement) {
        setText(settings.user_agreement);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12 md:py-24 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-12">
          Пользовательское соглашение
        </h1>
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {text}
        </div>
      </main>

      <Footer />
    </div>
  );
}
