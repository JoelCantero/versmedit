import type { ReactNode } from 'react'
import Footer from './Footer'
import HeaderNavigation from './HeaderNavigation'

type LayoutProps = {
  children: ReactNode
  onNavigateHome: () => void
  onNavigateToMyAccount: () => void
  onNavigate: (path: string) => void
}

export default function Layout({ children, onNavigateHome, onNavigateToMyAccount, onNavigate }: LayoutProps) {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
      >
        <div
          style={{
            clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)'
          }}
          className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%-30rem)] sm:w-288.75"
        />
      </div>
      <HeaderNavigation onNavigateHome={onNavigateHome} onNavigateToMyAccount={onNavigateToMyAccount} onNavigate={onNavigate} />
      <main className="relative z-10 flex-1">{children}</main>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-32 -z-10 transform-gpu overflow-hidden blur-3xl sm:-bottom-56"
      >
        <div
          style={{
            clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)'
          }}
          className="relative left-[calc(50%+3rem)] aspect-1155/678 w-144.5 -translate-x-1/2 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%+36rem)] sm:w-288.75"
        />
      </div>
      <div className="relative z-10 mt-auto">
        <Footer />
      </div>
    </div>
  )
}