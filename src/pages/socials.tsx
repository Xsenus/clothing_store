import { Suspense, lazy } from "react";
import { Navigate } from "react-router";

import Header from "@/components/Header";
import PageSeo from "@/components/PageSeo";
import SocialLinksList from "@/components/social/SocialLinksList";
import useSiteSocialLinks from "@/hooks/useSiteSocialLinks";

const Footer = lazy(() => import("@/components/Footer"));

function FooterPlaceholder() {
  return <div className="min-h-[220px] bg-black" aria-hidden="true" />;
}

export default function SocialsPage() {
  const { config, loading, pageLinks } = useSiteSocialLinks();

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main className="container mx-auto flex min-h-screen items-center justify-center px-4 pb-16 pt-28">
          <div className="text-sm uppercase tracking-[0.24em] text-muted-foreground">
            Загружаем соцсети...
          </div>
        </main>
      </div>
    );
  }

  if (!config.enabled || !config.pageEnabled || pageLinks.length === 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageSeo
        title={config.pageTitle}
        description={config.pageDescription}
        canonicalPath="/socials"
        keywords={["соцсети", "социальные сети", "контакты", "fashiondemon"]}
      />
      <Header />

      <main className="pb-16 pt-28">
        <section className="relative overflow-hidden border-b border-black/10 bg-[linear-gradient(135deg,#f6f2eb_0%,#ffffff_45%,#ece8ff_100%)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,0,0,0.06),transparent_38%)]" />
          <div className="container relative mx-auto px-4 py-16 md:py-24">
            <div className="max-w-3xl space-y-5">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                Socials
              </div>
              <h1 className="text-4xl font-black uppercase leading-none tracking-tight sm:text-5xl md:text-6xl">
                {config.pageTitle}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-black/65 md:text-lg">
                {config.pageDescription}
              </p>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-12 md:py-16">
          <SocialLinksList items={pageLinks} variant="page" />
        </section>
      </main>

      <Suspense fallback={<FooterPlaceholder />}>
        <Footer />
      </Suspense>
    </div>
  );
}
