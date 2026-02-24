import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fetchPublicSettings } from '@/lib/site-settings';

const consentKey = 'cookieConsentAccepted';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('Мы используем cookie для улучшения работы сайта. Продолжая пользоваться сайтом, вы соглашаетесь с этим.');

  useEffect(() => {
    const accepted = localStorage.getItem(consentKey) === '1';
    if (!accepted) {
      setVisible(true);
    }

    const load = async () => {
      const settings = await fetchPublicSettings();
      if (settings?.cookie_consent_text) {
        setText(settings.cookie_consent_text);
      }
    };

    load();
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:max-w-xl bg-black text-white p-4 z-[100] border border-white/20 shadow-2xl">
      <p className="text-sm leading-relaxed">{text}</p>
      <div className="mt-3 flex gap-2 justify-end">
        <Button
          variant="outline"
          className="rounded-none border-white text-black"
          onClick={() => setVisible(false)}
        >
          Закрыть
        </Button>
        <Button
          className="rounded-none bg-white text-black hover:bg-gray-200"
          onClick={() => {
            localStorage.setItem(consentKey, '1');
            setVisible(false);
          }}
        >
          Принять cookie
        </Button>
      </div>
    </div>
  );
}

