import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import { useTranslation } from '../i18n/LanguageContext'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import VersePlayer, { type VersePlayerVerse } from '../components/VersePlayer'

type AccountSummaryResponse = {
  verses: Array<{
    id: string
    reference: string
    verse: string
    category: string
    leitnerLevel: number
    learningState: 'LEARNING' | 'MASTERED'
    dueAt: string
    categoryRel: {
      id: string
      name: string
      color: string | null
    } | null
  }>
}

export default function Practice() {
  const { t } = useTranslation()
  const [verses, setVerses] = useState<VersePlayerVerse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadVerses = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const accountSummary = await apiFetch<AccountSummaryResponse>('/account/my-account')
        const mappedVerses: VersePlayerVerse[] = accountSummary.verses.map((item) => ({
          id: item.id,
          reference: item.reference,
          verse: item.verse,
          category: item.categoryRel?.name ?? item.category,
          categoryColor: item.categoryRel?.color ?? null,
          leitnerLevel: item.leitnerLevel,
        }))

        for (let i = mappedVerses.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [mappedVerses[i], mappedVerses[j]] = [mappedVerses[j], mappedVerses[i]]
        }

        setVerses(mappedVerses)
      } catch (loadError) {
        if (loadError instanceof Error) {
          if (loadError.message.includes('status 401')) {
            setError(t('practice.loginRequired'))
          } else {
            setError(t('practice.loadError'))
          }
        } else {
          setError(t('practice.loadError'))
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadVerses()
  }, [])

  if (isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-6 py-28 lg:px-8">
        <div className="flex items-center gap-3 rounded-xl bg-white/60 px-4 py-3 ring-1 ring-gray-900/10 backdrop-blur-sm dark:bg-gray-900/40 dark:ring-white/10">
          <span className="size-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-sm text-foreground">{t('practice.loading')}</span>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-6 py-28 lg:px-8">
        <div className="rounded-xl bg-white/60 p-6 text-center ring-1 ring-red-300 backdrop-blur-sm dark:bg-gray-900/40 dark:ring-red-500/40">
          <p className="text-sm font-medium text-destructive">{error}</p>
        </div>
      </section>
    )
  }

  if (verses.length === 0) {
    return (
      <PageShell>
        <PageHeader title={t('practice.title')} description={t('practice.noVerses')} />
      </PageShell>
    )
  }

  return (
    <>
      <PageShell className="pb-4">
        <PageHeader title={t('practice.title')} description={t('practice.description')} />
      </PageShell>
      <VersePlayer verses={verses} mode="practice" />
    </>
  )
}
