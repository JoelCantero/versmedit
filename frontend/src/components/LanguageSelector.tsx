import { LanguageIcon } from '@heroicons/react/24/solid'
import { useTranslation, type Language } from '../i18n/LanguageContext'

export default function LanguageSelector() {
  const { language, setLanguage } = useTranslation()

  const toggle = () => {
    const next: Language = language === 'en' ? 'es' : 'en'
    setLanguage(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="cursor-pointer inline-flex items-center gap-1 text-foreground"
    >
      <LanguageIcon aria-hidden="true" className="size-5" />
      <span className="text-sm font-semibold uppercase">{language}</span>
    </button>
  )
}
