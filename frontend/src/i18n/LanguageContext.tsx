import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import en from './translations/en'
import es from './translations/es'
import type { TranslationKey } from './translations/en'

export type Language = 'en' | 'es'

const translations: Record<Language, Record<TranslationKey, string>> = { en, es }

const STORAGE_KEY = 'language'

function detectLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'es') return stored
  } catch {
    // localStorage unavailable
  }

  const browserLang = navigator.language.slice(0, 2)
  return browserLang === 'es' ? 'es' : 'en'
}

type LanguageContextValue = {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage)

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // localStorage unavailable
    }
  }

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    let value = translations[language][key] ?? translations.en[key] ?? key
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(`{${paramKey}}`, String(paramValue))
      }
    }
    return value
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider')
  }
  return context
}
