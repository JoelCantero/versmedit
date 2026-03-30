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
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Loading account...</p>
      </main>
    )
  }

  if (!accountData) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-28 lg:px-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">My Account</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            You need to log in to view your account details.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-28 lg:px-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">My Account</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Authenticated account information from Better Auth.</p>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <dt className="text-gray-500 dark:text-gray-400">Name</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">{accountData.user.name ?? 'Not set'}</dd>
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <dt className="text-gray-500 dark:text-gray-400">Email</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">{accountData.user.email}</dd>
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <dt className="text-gray-500 dark:text-gray-400">Email verified</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">{accountData.user.emailVerified ? 'Yes' : 'No'}</dd>
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <dt className="text-gray-500 dark:text-gray-400">Session expires</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">{new Date(accountData.session.expiresAt).toLocaleString()}</dd>
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800 sm:col-span-2">
            <dt className="text-gray-500 dark:text-gray-400">User ID</dt>
            <dd className="mt-1 break-all font-medium text-gray-900 dark:text-white">{accountData.user.id}</dd>
          </div>
        </dl>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Categories</h2>
            <span className="text-sm text-gray-600 dark:text-gray-300">{accountData.categories.length} total</span>
          </div>
          {accountData.categories.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">No categories linked to this account yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {accountData.categories.map((category) => (
                <li key={category.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{category.name}</p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    Color: {category.color ?? 'None'} · Verses: {category._count.verses}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Level summary</h2>
            <span className="text-sm text-gray-600 dark:text-gray-300">1 to 7</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {levelSummary.map((item) => (
              <div key={item.level} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Level {item.level}</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{item.count} verses</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Verses</h2>
            <span className="text-sm text-gray-600 dark:text-gray-300">{accountData.verses.length} total</span>
          </div>
          {accountData.verses.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">No verses linked to this account yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {accountData.verses.map((verse) => (
                <li key={verse.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-sm text-gray-900 dark:text-white">{verse.verse}</p>
                  <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-200">{verse.reference}</p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    Category: {verse.categoryRel?.name ?? verse.category}
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    Level: {verse.leitnerLevel} · State: {verse.learningState} · Due: {new Date(verse.dueAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
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
