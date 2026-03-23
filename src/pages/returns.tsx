import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { RETURN_POLICY } from '@/lib/legal-texts';
import { useEffect, useState } from 'react';
import { fetchPublicSettings } from '@/lib/site-settings';
import PageSeo from '@/components/PageSeo';

export default function ReturnsPage() {
  const [text, setText] = useState(RETURN_POLICY);

  useEffect(() => {
    const load = async () => {
      const settings = await fetchPublicSettings();
      if (settings?.return_policy) {
        setText(settings.return_policy);
      }
    };

    void load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <PageSeo
        title="Условия возврата"
        description="Условия возврата товара магазина fashiondemon."
        canonicalPath="/returns"
        structuredData={({ canonicalUrl, title }) => ({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: title,
          url: canonicalUrl,
          inLanguage: "ru-RU",
        })}
      />
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12 md:py-24 max-w-4xl">
        <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-12 break-words [overflow-wrap:anywhere]">
          Условия возврата
        </h1>
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted-foreground">
          {text}
        </div>
      </main>

      <Footer />
    </div>
  );
}
