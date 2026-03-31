import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client'

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
  const [accountData, setAccountData] = useState<AuthSessionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-28 lg:px-8">
        <p className="text-sm font-medium text-muted-foreground">Loading account...</p>
      </main>
    )
  }

  if (!accountData) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-28 lg:px-8">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold text-foreground">My Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You need to log in to view your account details.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-28 lg:px-8">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold text-foreground">My Account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Authenticated account information from Better Auth.</p>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-muted p-4">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="mt-1 font-medium text-foreground">{accountData.user.name ?? 'Not set'}</dd>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="mt-1 font-medium text-foreground">{accountData.user.email}</dd>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <dt className="text-muted-foreground">Email verified</dt>
            <dd className="mt-1 font-medium text-foreground">{accountData.user.emailVerified ? 'Yes' : 'No'}</dd>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <dt className="text-muted-foreground">Session expires</dt>
            <dd className="mt-1 font-medium text-foreground">{new Date(accountData.session.expiresAt).toLocaleString()}</dd>
          </div>
          <div className="rounded-lg bg-muted p-4 sm:col-span-2">
            <dt className="text-muted-foreground">User ID</dt>
            <dd className="mt-1 break-all font-medium text-foreground">{accountData.user.id}</dd>
          </div>
        </dl>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Categories</h2>
            <span className="text-sm text-muted-foreground">{accountData.categories.length} total</span>
          </div>
          {accountData.categories.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No categories linked to this account yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {accountData.categories.map((category) => (
                <li key={category.id} className="rounded-lg border border-border bg-muted p-3">
                  <p className="text-sm font-medium text-foreground">{category.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Color: {category.color ?? 'None'} · Verses: {category._count.verses}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Level summary</h2>
            <span className="text-sm text-muted-foreground">1 to 7</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {levelSummary.map((item) => (
              <div key={item.level} className="rounded-lg border border-border bg-muted p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Level {item.level}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{item.count} verses</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Verses</h2>
            <span className="text-sm text-muted-foreground">{accountData.verses.length} total</span>
          </div>
          {accountData.verses.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No verses linked to this account yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {accountData.verses.map((verse) => (
                <li key={verse.id} className="rounded-lg border border-border bg-muted p-3">
                  <p className="text-sm text-foreground">{verse.verse}</p>
                  <p className="mt-2 text-xs font-medium text-foreground">{verse.reference}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Category: {verse.categoryRel?.name ?? verse.category}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Level: {verse.leitnerLevel} · State: {verse.learningState} · Due: {new Date(verse.dueAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reviews: {verse.totalReviews} total ({verse.successfulReviews} success / {verse.failedReviews} fail) · Resets: {verse.resetCount}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
