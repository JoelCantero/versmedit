import { useEffect, useMemo, useState } from 'react'
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import { apiFetch } from '../api/client'
import Button from './Button'

export type MemorizeVerse = {
  id: string
  reference: string
  verse: string
  category: string
  leitnerLevel: number
}

type MemorizeAppProps = {
  verses: MemorizeVerse[]
}

type PersistedReview = {
  leitnerLevel: number
  learningState: 'LEARNING' | 'MASTERED'
  dueAt: string
}

const SHOWN_VERSES_STORAGE_KEY = 'memorize.shownVerses'

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const getWords = (text: string) =>
  text
    .replace(/["“”]/g, '')
    .split(/\s+/)
    .filter(Boolean)

const getShownVersesFromStorage = (): string[] => {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const stored = window.localStorage.getItem(SHOWN_VERSES_STORAGE_KEY)
    return stored ? (JSON.parse(stored) as string[]) : []
  } catch {
    return []
  }
}

export default function MemorizeApp({ verses }: MemorizeAppProps) {
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0)
  const [showText, setShowText] = useState(false)
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [wordsWithErrors, setWordsWithErrors] = useState<Set<number>>(new Set())
  const [completionStatus, setCompletionStatus] = useState<'perfect' | 'good' | null>(null)
  const [shownVerses, setShownVerses] = useState<string[]>(() => getShownVersesFromStorage())
  const [persistedReviewVerseIds, setPersistedReviewVerseIds] = useState<Set<string>>(new Set())
  const [persistingReviewVerseIds, setPersistingReviewVerseIds] = useState<Set<string>>(new Set())
  const [persistedReviews, setPersistedReviews] = useState<Record<string, PersistedReview>>({})
  const [reviewPersistError, setReviewPersistError] = useState<string | null>(null)

  const currentVerse = verses[currentVerseIndex]
  const currentWords = useMemo(() => getWords(currentVerse.verse), [currentVerse.verse])
  const hasShownVerse = shownVerses.includes(currentVerse.id)
  const currentLevel = currentVerse.leitnerLevel
  const persistedReview = persistedReviews[currentVerse.id]
  const persistedNextReviewDate = persistedReview?.dueAt ? new Date(persistedReview.dueAt) : null
  const nextLevelLabel = currentLevel >= 7 ? 'Mastered' : `Level ${currentLevel + 1}`
  const nextReviewMessage = useMemo(() => {
    if (nextLevelLabel === 'Mastered' || persistedReview?.learningState === 'MASTERED') {
      return 'No further review is needed.'
    }

    if (!persistedReview || !persistedNextReviewDate || Number.isNaN(persistedNextReviewDate.getTime())) {
      return 'Saving review schedule...'
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueDay = new Date(persistedNextReviewDate)
    dueDay.setHours(0, 0, 0, 0)

    const oneDayMs = 24 * 60 * 60 * 1000
    const dayDifference = Math.round((dueDay.getTime() - today.getTime()) / oneDayMs)

    if (dayDifference <= 0) {
      return 'It will be reviewed again today.'
    }

    if (dayDifference === 1) {
      return 'It will be reviewed again tomorrow.'
    }

    return `It will be reviewed again on ${persistedNextReviewDate.toLocaleDateString('en-GB')}.`
  }, [nextLevelLabel, persistedReview, persistedNextReviewDate])
  const perfectMessage =
    nextLevelLabel === 'Mastered'
      ? 'Amazing! You have mastered this verse.'
      : `Perfect! You move up from level ${currentLevel} to ${nextLevelLabel}.`

  useEffect(() => {
    window.localStorage.setItem(SHOWN_VERSES_STORAGE_KEY, JSON.stringify(shownVerses))
  }, [shownVerses])

  useEffect(() => {
    setCurrentWordIndex(0)
    setHasError(false)
    setWordsWithErrors(new Set())
    setCompletionStatus(null)
    setReviewPersistError(null)
  }, [currentVerseIndex])

  const saveCurrentReview = async () => {
    if (completionStatus === null) {
      return true
    }

    if (persistedReviewVerseIds.has(currentVerse.id)) {
      return true
    }

    if (persistingReviewVerseIds.has(currentVerse.id)) {
      return false
    }

    setPersistingReviewVerseIds((prev) => new Set(prev).add(currentVerse.id))
    setReviewPersistError(null)

    try {
      const result = await apiFetch<{
        verse: {
          id: string
          leitnerLevel: number
          learningState: 'LEARNING' | 'MASTERED'
          dueAt: string
        }
      }>(`/account/verses/${currentVerse.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ success: completionStatus === 'perfect' }),
      })

      setPersistedReviewVerseIds((prev) => new Set(prev).add(currentVerse.id))
      setPersistedReviews((prev) => ({
        ...prev,
        [currentVerse.id]: {
          leitnerLevel: result.verse.leitnerLevel,
          learningState: result.verse.learningState,
          dueAt: result.verse.dueAt,
        },
      }))
      return true
    } catch {
      setReviewPersistError('Unable to save your progress right now. Please try again.')
      return false
    } finally {
      setPersistingReviewVerseIds((prev) => {
        const next = new Set(prev)
        next.delete(currentVerse.id)
        return next
      })
    }
  }

  const handleAdvance = async () => {
    if (completionStatus !== null) {
      const wasSaved = await saveCurrentReview()

      if (!wasSaved) {
        return
      }
    }

    if (currentVerseIndex < verses.length - 1) {
      nextVerse()
    }
  }

  useEffect(() => {
    if (completionStatus === null) {
      return
    }

    void saveCurrentReview()
  }, [completionStatus])

  useEffect(() => {
    const isCompleted = currentWordIndex === currentWords.length
    const hasNoErrors = wordsWithErrors.size === 0

    if (isCompleted && hasNoErrors) {
      setCompletionStatus('perfect')
      return
    }

    if (isCompleted && !hasNoErrors) {
      setCompletionStatus('good')
      return
    }

    setCompletionStatus(null)
  }, [currentWordIndex, wordsWithErrors, currentWords.length])

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && completionStatus !== null) {
        event.preventDefault()
        void handleAdvance()
        return
      }

      if (showText || completionStatus !== null) {
        return
      }

      if (event.key.length !== 1) {
        return
      }

      if (currentWordIndex >= currentWords.length) {
        return
      }

      const pressedLetter = normalizeText(event.key)
      const currentWord = currentWords[currentWordIndex]
      const firstLetter = normalizeText(currentWord.charAt(0))

      if (firstLetter === pressedLetter) {
        if (hasError) {
          setWordsWithErrors((prev) => new Set([...prev, currentWordIndex]))
        }
        setCurrentWordIndex((prev) => prev + 1)
        setHasError(false)
      } else {
        setHasError(true)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [
    completionStatus,
    currentVerseIndex,
    currentWordIndex,
    currentWords,
    hasError,
    showText,
    verses.length,
    persistingReviewVerseIds,
    persistedReviewVerseIds,
  ])

  const nextVerse = () => {
    setCurrentVerseIndex((prev) => {
      if (prev >= verses.length - 1) {
        return prev
      }
      return prev + 1
    })
    setShowText(false)
    setCurrentWordIndex(0)
    setHasError(false)
    setWordsWithErrors(new Set())
    setCompletionStatus(null)
  }

  const toggleText = () => {
    if (!showText && hasShownVerse) {
      return
    }

    if (!showText) {
      setShownVerses((prev) => (prev.includes(currentVerse.id) ? prev : [...prev, currentVerse.id]))
    }

    setShowText((prev) => !prev)
  }

  const renderWordBadges = () => {
    return (
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2">
        {currentWords.map((word, index) => {
          const isRevealed = index < currentWordIndex
          const isNext = index === currentWordIndex
          const isError = isNext && hasError
          const hadError = wordsWithErrors.has(index)

          let badgeClasses = 'bg-gray-200/80 text-transparent ring-gray-300 dark:bg-gray-800 dark:ring-gray-700'

          if (completionStatus !== null) {
            badgeClasses = 'bg-gray-200/80 text-gray-900 ring-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700'
          } else if (isRevealed && hadError) {
            badgeClasses = 'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-600/40'
          } else if (isRevealed) {
            badgeClasses = 'bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100 dark:ring-emerald-600/40'
          } else if (isError) {
            badgeClasses = 'bg-red-100 text-transparent ring-red-300 dark:bg-red-900/40 dark:text-transparent dark:ring-red-600/40'
          } else if (isNext) {
            badgeClasses = 'bg-indigo-100 text-transparent ring-indigo-300 dark:bg-indigo-900/40 dark:text-transparent dark:ring-indigo-600/40'
          }

          return (
            <span
              key={`${word}-${index}`}
              className={`select-none rounded-full px-3 py-1 text-sm font-medium ring-1 ${badgeClasses}`}
            >
              {word}
            </span>
          )
        })}
      </div>
    )
  }

  const progress = ((currentVerseIndex + 1) / verses.length) * 100

  return (
    <section className="mx-auto max-w-5xl px-6 py-28 lg:px-8">
      <div className="rounded-2xl bg-white/60 p-8 shadow-lg ring-1 ring-gray-900/10 backdrop-blur-sm dark:bg-gray-900/40 dark:ring-white/10">
        <div className="mb-6 flex justify-center">
          <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-foreground ring-1 ring-border">
            {currentVerse.category}
          </span>
        </div>

        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-foreground">{currentVerse.reference}</h2>
        </div>

        <div className="mb-8 flex min-h-32 items-center justify-center">
          {showText ? (
            <p className="max-w-2xl text-center text-xl leading-relaxed text-foreground">&quot;{currentVerse.verse}&quot;</p>
          ) : (
            <div className="space-y-6 text-center">
              {renderWordBadges()}

              {completionStatus === 'perfect' ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100 dark:ring-emerald-600/40">
                    <CheckCircleIcon className="size-4" />
                    {perfectMessage}
                  </span>
                  <p className="text-sm text-muted-foreground">{nextReviewMessage}</p>
                </div>
              ) : completionStatus === 'good' ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-600/40">
                    <ArrowPathIcon className="size-4" />
                    Try to improve next time! Back to level 1.
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Tip: Type the first letter of each word in order to reveal them.
                </p>
              )}

              {completionStatus !== null ? (
                <p className="text-sm text-muted-foreground">Press Enter to continue to the next verse.</p>
              ) : null}

              {reviewPersistError ? (
                <p className="text-sm font-medium text-destructive">{reviewPersistError}</p>
              ) : null}
            </div>
          )}
        </div>

        {completionStatus === null ? (
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              type="button"
              onClick={toggleText}
              disabled={hasShownVerse && !showText}
            >
              {showText ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
              {showText ? 'Hide verse' : hasShownVerse ? 'Already shown' : 'Show verse'}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div />

        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-muted-foreground">
            {currentVerseIndex + 1} of {verses.length}
          </span>
          <div className="h-2 w-32 rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-2 rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <Button
          type="button"
          variant={completionStatus !== null ? 'primary' : 'secondary'}
          onClick={() => {
            void handleAdvance()
          }}
          disabled={currentVerseIndex === verses.length - 1 && completionStatus === null}
        >
          Next verse
          <ArrowRightIcon className="size-4" />
        </Button>
      </div>
    </section>
  )
}