import { useEffect, useState } from 'react';

export function BilingualText({ en, am, className }: { en: string; am?: string | null; className?: string }) {
  // Simple state to force re-render if language changes (though usually a page refresh or context is better, we'll use a custom event)
  const [lang, setLang] = useState(localStorage.getItem('coffee_land_lang') || 'en');

  useEffect(() => {
    const handleLangChange = () => setLang(localStorage.getItem('coffee_land_lang') || 'en');
    window.addEventListener('languagechange', handleLangChange);
    return () => window.removeEventListener('languagechange', handleLangChange);
  }, []);

  const isAmharicPrimary = lang === 'am';
  const primary = isAmharicPrimary && am ? am : en;
  const secondary = isAmharicPrimary && am ? en : am;

  return (
    <div className={className}>
      <div className="font-medium">{primary}</div>
      {secondary && <div className="text-[0.8em] opacity-70 mt-0.5">{secondary}</div>}
    </div>
  );
}

export function switchLanguage(lang: 'en' | 'am') {
  localStorage.setItem('coffee_land_lang', lang);
  window.dispatchEvent(new Event('languagechange'));
}
