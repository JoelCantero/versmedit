import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import { useTranslation } from '../i18n/LanguageContext'

type AuthSessionResponse = {
  session: {
    id: string
    expiresAt: string
    createdAt: string
  }
  user: {
    id: string
    name: string | null
    email: string
    emailVerified: boolean
    createdAt: string
  }
  categories: Array<{
    id: string
    name: string
    color: string | null
    createdAt: string
    _count: {
      verses: number
    }
  }>
  verses: Array<{
    id: string
    verse: string
    reference: string
    category: string
    categoryId: string | null
    leitnerLevel: number
    learningState: 'LEARNING' | 'MASTERED'
    dueAt: string
    lastReviewedAt: string | null
    masteredAt: string | null
    totalReviews: number
    successfulReviews: number
    failedReviews: number
    resetCount: number
    createdAt: string
    categoryRel: {
      id: string
      name: string
      color: string | null
    } | null
  }>
}

export default function MyAccount() {
  const { t } = useTranslation()
  const [accountData, setAccountData] = useState<AuthSessionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [resettingVerseId, setResettingVerseId] = useState<string | null>(null)
  const [studyAgainError, setStudyAgainError] = useState<string | null>(null)

  const levelSummary = useMemo(() => {
    const levels = Array.from({ length: 7 }, (_, index) => ({
      level: index + 1,
      count: 0,
    }))

    if (!accountData) {
      return levels
    }

    for (const verse of accountData.verses) {
      if (verse.leitnerLevel >= 1 && verse.leitnerLevel <= 7) {
        levels[verse.leitnerLevel - 1].count += 1
      }
    }

    return levels
  }, [accountData])

  useEffect(() => {
    const loadSession = async () => {
      try {
        const accountSummary = await apiFetch<AuthSessionResponse>('/account/my-account')
        setAccountData(accountSummary)
      } catch {
        setAccountData(null)
      } finally {
        setIsLoading(false)
      }
    }

    void loadSession()
  }, [])

  const handleStudyAgain = async (verseId: string) => {
    setResettingVerseId(verseId)
    setStudyAgainError(null)

    try {
      const response = await apiFetch<{
        verse: {
          id: string
          leitnerLevel: number
          learningState: 'LEARNING' | 'MASTERED'
          dueAt: string
          masteredAt: string | null
          resetCount: number
        }
      }>(`/account/verses/${encodeURIComponent(verseId)}/study-again`, {
        method: 'POST',
      })

      setAccountData((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          verses: current.verses.map((verse) =>
            verse.id === response.verse.id
              ? {
                  ...verse,
                  leitnerLevel: response.verse.leitnerLevel,
                  learningState: response.verse.learningState,
                  dueAt: response.verse.dueAt,
                  masteredAt: response.verse.masteredAt,
                  resetCount: response.verse.resetCount,
                }
              : verse,
          ),
        }
      })
    } catch {
      setStudyAgainError(t('myAccount.studyAgainError'))
    } finally {
      setResettingVerseId(null)
    }
  }

  if (isLoading) {
    return (
      <PageShell>
        <p className="text-sm font-medium text-muted-foreground">{t('myAccount.loading')}</p>
      </PageShell>
    )
  }

  if (!accountData) {
    return (
      <PageShell>
        <PageHeader
          title={t('myAccount.title')}
          description={t('myAccount.loginRequired')}
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title={t('myAccount.title')}
        description={t('myAccount.description')}
      />
      <div className="mt-10 rounded-2xl border border-border bg-card p-6">

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-muted p-4">
            <dt className="text-muted-foreground">{t('myAccount.name')}</dt>
            <dd className="mt-1 font-medium text-foreground">{accountData.user.name ?? t('myAccount.notSet')}</dd>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <dt className="text-muted-foreground">{t('myAccount.email')}</dt>
            <dd className="mt-1 font-medium text-foreground">{accountData.user.email}</dd>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <dt className="text-muted-foreground">{t('myAccount.emailVerified')}</dt>
            <dd className="mt-1 font-medium text-foreground">{accountData.user.emailVerified ? t('myAccount.yes') : t('myAccount.no')}</dd>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <dt className="text-muted-foreground">{t('myAccount.sessionExpires')}</dt>
            <dd className="mt-1 font-medium text-foreground">{new Date(accountData.session.expiresAt).toLocaleString()}</dd>
          </div>
          <div className="rounded-lg bg-muted p-4 sm:col-span-2">
            <dt className="text-muted-foreground">{t('myAccount.userId')}</dt>
            <dd className="mt-1 break-all font-medium text-foreground">{accountData.user.id}</dd>
          </div>
        </dl>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t('myAccount.categories')}</h2>
            <span className="text-sm text-muted-foreground">{accountData.categories.length} {t('myAccount.total')}</span>
          </div>
          {accountData.categories.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('myAccount.noCategories')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {accountData.categories.map((category) => (
                <li key={category.id} className="rounded-lg border border-border bg-muted p-3">
                  <p className="text-sm font-medium text-foreground">{category.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('myAccount.color')}: {category.color ?? t('myAccount.none')} · {t('myAccount.verses')}: {category._count.verses}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t('myAccount.levelSummary')}</h2>
            <span className="text-sm text-muted-foreground">1 to 7</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {levelSummary.map((item) => (
              <div key={item.level} className="rounded-lg border border-border bg-muted p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('myAccount.level')} {item.level}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{item.count} {t('myAccount.versesCount')}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t('myAccount.verses')}</h2>
            <span className="text-sm text-muted-foreground">{accountData.verses.length} {t('myAccount.total')}</span>
          </div>
          {studyAgainError ? <p className="mt-3 text-sm text-destructive">{studyAgainError}</p> : null}
          {accountData.verses.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('myAccount.noVerses')}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {accountData.verses.map((verse) => (
                <li key={verse.id} className="rounded-lg border border-border bg-muted p-3">
                  <p className="text-sm text-foreground">{verse.verse}</p>
                  <p className="mt-2 text-xs font-medium text-foreground">{verse.reference}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('myAccount.category')}: {verse.categoryRel?.name ?? verse.category}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('myAccount.level')}: {verse.leitnerLevel} · {t('myAccount.state')}: {verse.learningState} · {t('myAccount.due')}: {new Date(verse.dueAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('myAccount.reviews')}: {verse.totalReviews} {t('myAccount.total')} ({verse.successfulReviews} {t('myAccount.success')} / {verse.failedReviews} {t('myAccount.fail')}) · {t('myAccount.resets')}: {verse.resetCount}
                  </p>
                  {verse.learningState === 'MASTERED' ? (
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={resettingVerseId === verse.id}
                        onClick={() => {
                          void handleStudyAgain(verse.id)
                        }}
                      >
                        {resettingVerseId === verse.id ? t('myAccount.studyingAgain') : t('myAccount.studyAgain')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  )
}
