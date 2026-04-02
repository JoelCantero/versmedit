import { useTranslation, type Language } from '../i18n/LanguageContext'
import Dropdown from './Dropdown'

const languageOptions: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
]

export default function LanguageSelector() {
  const { language, setLanguage } = useTranslation()
  const currentLabel = languageOptions.find((o) => o.value === language)?.label ?? 'English'

  return (
    <Dropdown
      label={currentLabel}
      items={languageOptions.map((option) => ({
        label: option.label,
        onClick: () => setLanguage(option.value),
      }))}
    />
  )
}
