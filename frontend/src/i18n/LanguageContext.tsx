import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import en from './translations/en'
import es from './translations/es'
import type { TranslationKey } from './translations/en'

export type Language = 'en' | 'es'

const translations: Record<Language, Record<TranslationKey, string>> = { en, es }

const STORAGE_KEY = 'language'

type LanguageContextValue = {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  localePath: (path: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children, urlLocale }: { children: ReactNode; urlLocale: Language }) {
  const navigate = useNavigate()
  const location = useLocation()

  const language = urlLocale

  const setLanguage = (lang: Language) => {
    // Get current path without locale prefix
    let barePath = location.pathname
    if (barePath.startsWith('/es/')) {
      barePath = barePath.slice(3)
    } else if (barePath === '/es') {
      barePath = '/'
    }

    const newPath = lang === 'en' ? barePath : (barePath === '/' ? '/es' : `/es${barePath}`)
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // localStorage unavailable
    }
    navigate(newPath)
  }

  useEffect(() => {
    document.documentElement.lang = language
    try {
      window.localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // localStorage unavailable
    }
  }, [language])

  const localePath = (path: string): string => {
    if (language === 'en') return path
    return path === '/' ? '/es' : `/es${path}`
  }

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
    <LanguageContext.Provider value={{ language, setLanguage, t, localePath }}>
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
