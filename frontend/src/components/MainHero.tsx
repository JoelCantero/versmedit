import Button from './Button'

type MainHeroProps = {
  onNavigateToMemorize: () => void
  onNavigateToMyAccount: () => void
}

export default function MainHero({ onNavigateToMemorize, onNavigateToMyAccount }: MainHeroProps) {
  return (
    <div className="px-6 pt-14 lg:px-8">
      <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
        <div className="hidden sm:mb-8 sm:flex sm:justify-center">
          <div className="relative rounded-full px-3 py-1 text-sm/6 text-muted-foreground ring-1 ring-gray-900/10 hover:ring-gray-900/20 dark:ring-white/15 dark:hover:ring-white/30">
            VerseMedit daily focus.{' '}
            <button type="button" onClick={onNavigateToMyAccount} className="font-semibold text-indigo-600 dark:text-indigo-400">
              Start meditating <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground sm:text-6xl">
            Memorize the Bible, meditate on God's Word
          </h1>
          <p className="mt-8 text-lg font-medium text-pretty text-muted-foreground sm:text-xl/8">
            Keep Scripture in your heart through daily repetition and reflection. VerseMedit helps you build categories,
            review your verses, and stay rooted in the Word every day.
          </p>
          <div className="rounded mt-10 flex items-center justify-center gap-x-6">
            <Button type="button" onClick={onNavigateToMemorize} className="px-3.5 py-2.5">
              Start memorizing now
            </Button>
            <Button type="button" variant="ghost" onClick={onNavigateToMyAccount} className="text-foreground">
              Go to My Account <span aria-hidden="true">→</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
