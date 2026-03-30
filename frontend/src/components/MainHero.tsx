import { Button } from '@headlessui/react'

export default function MainHero() {
  return (
    <div className="px-6 pt-14 lg:px-8">
      <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
        <div className="hidden sm:mb-8 sm:flex sm:justify-center">
          <div className="relative rounded-full px-3 py-1 text-sm/6 text-gray-600 ring-1 ring-gray-900/10 hover:ring-gray-900/20 dark:text-gray-300 dark:ring-white/15 dark:hover:ring-white/30">
            VerseMedit daily focus.{' '}
            <a href="/my-account" className="font-semibold text-indigo-600 dark:text-indigo-400">
              <span aria-hidden="true" className="absolute inset-0" />
              Start meditating <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-gray-900 dark:text-white sm:text-6xl">
            Memorize the Bible, meditate on God's Word
          </h1>
          <p className="mt-8 text-lg font-medium text-pretty text-gray-600 dark:text-gray-300 sm:text-xl/8">
            Keep Scripture in your heart through daily repetition and reflection. VerseMedit helps you build categories,
            review your verses, and stay rooted in the Word every day.
          </p>
          <div className="rounded mt-10 flex items-center justify-center gap-x-6">
            <Button
              as="a"
              href="/memorize"
              className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Start memorizing now
            </Button>
            <Button as="a" href="/my-account" className="text-sm/6 font-semibold text-gray-900 dark:text-gray-100">
              Go to My Account <span aria-hidden="true">→</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
