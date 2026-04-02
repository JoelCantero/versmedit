import { useNavigate } from 'react-router-dom'
import Button from './Button'
import { useTranslation } from '../i18n/LanguageContext'

export default function MainHero() {
  const { t, localePath } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="px-6 pt-14 lg:px-8">
      <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
        <div className="hidden sm:mb-8 sm:flex sm:justify-center">
          <div className="relative rounded-full px-3 py-1 text-sm/6 text-muted-foreground ring-1 ring-gray-900/10 hover:ring-gray-900/20 dark:ring-white/15 dark:hover:ring-white/30">
            {t('hero.badge')}{' '}
            <button type="button" onClick={() => navigate(localePath('/my-account'))} className="font-semibold text-indigo-600 dark:text-indigo-400">
              {t('hero.badgeLink')} <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground sm:text-6xl">
            {t('hero.title')}
          </h1>
          <p className="mt-8 text-lg font-medium text-pretty text-muted-foreground sm:text-xl/8">
            {t('hero.description')}
          </p>
          <div className="rounded mt-10 flex items-center justify-center gap-x-6">
            <Button type="button" onClick={() => navigate(localePath('/memorize'))} className="px-3.5 py-2.5">
              {t('hero.cta')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate(localePath('/my-account'))} className="text-foreground">
              {t('hero.ctaSecondary')} <span aria-hidden="true">→</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
