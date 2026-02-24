import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PRIVACY_POLICY } from '@/lib/legal-texts';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-12 md:py-24 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-12">
          Политика конфиденциальности
        </h1>
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {PRIVACY_POLICY}
        </div>
      </main>

      <Footer />
    </div>
  );
}
