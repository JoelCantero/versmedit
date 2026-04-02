import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import PageShell from '../components/PageShell'
import { useTranslation } from '../i18n/LanguageContext'

export default function NotFound() {
  const { t, localePath } = useTranslation()
  const navigate = useNavigate()

  return (
    <PageShell>
      <div className="text-center">
        <p className="text-base font-semibold text-primary">{t('notFound.code')}</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-balance text-foreground sm:text-7xl">
          {t('notFound.title')}
        </h1>
        <p className="mt-6 text-lg font-medium text-pretty text-muted-foreground sm:text-xl/8">
          {t('notFound.description')}
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Button onClick={() => navigate(localePath('/'))}>{t('notFound.goHome')}</Button>
          <button onClick={() => navigate(localePath('/contact'))} className="cursor-pointer text-sm font-semibold text-foreground">
            {t('notFound.contactSupport')} <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </div>
    </PageShell>
  )
}
