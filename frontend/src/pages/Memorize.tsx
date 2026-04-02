import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'
import MemorizeApp, { type MemorizeVerse } from '../components/MemorizeApp'

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

export default function Memorize() {
  const [verses, setVerses] = useState<MemorizeVerse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadVerses = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const accountSummary = await apiFetch<AccountSummaryResponse>('/account/my-account?dueOnly=true')
        const mappedVerses: MemorizeVerse[] = accountSummary.verses.map((item) => ({
          id: item.id,
          reference: item.reference,
          verse: item.verse,
          category: item.categoryRel?.name ?? item.category,
          categoryColor: item.categoryRel?.color ?? null,
          leitnerLevel: item.leitnerLevel,
        }))

        setVerses(mappedVerses)
      } catch (loadError) {
        if (loadError instanceof Error) {
          if (loadError.message.includes('status 401')) {
            setError('Please sign in to access memorize mode.')
          } else {
            setError('Unable to load verses right now. Please try again.')
          }
        } else {
          setError('Unable to load verses right now. Please try again.')
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
          <span className="text-sm text-foreground">Loading verses...</span>
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
      <section className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-6 py-28 lg:px-8">
        <div className="rounded-xl bg-white/60 p-6 text-center ring-1 ring-gray-900/10 backdrop-blur-sm dark:bg-gray-900/40 dark:ring-white/10">
          <p className="text-sm text-foreground">No verses due for review right now. Keep going tomorrow or add new verses</p>
        </div>
      </section>
    )
  }

  return <MemorizeApp verses={verses} />
}