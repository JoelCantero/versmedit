'use client'

import { useEffect, useState } from 'react'
import { LanguageProvider } from './i18n/LanguageContext'
import Layout from './components/Layout'
import MainHero from './components/MainHero'
import Memorize from './pages/Memorize'
import MyAccount from './pages/MyAccount'
import AboutMe from './pages/AboutMe'
import Faq from './pages/Faq'
import Blog from './pages/Blog'
import Contact from './pages/Contact'
import NotFound from './pages/NotFound'
import SignUp from './pages/SignUp'

type View = 'home' | 'memorize' | 'my-account' | 'about-me' | 'faq' | 'blog' | 'contact' | 'sign-up' | 'not-found'

const viewPathMap: Record<View, string> = {
  home: '/',
  memorize: '/memorize',
  'my-account': '/my-account',
  'about-me': '/about-me',
  faq: '/faq',
  blog: '/blog',
  contact: '/contact',
  'sign-up': '/sign-up',
  'not-found': '/not-found',
}

const pathnameViewMap = Object.fromEntries(
  Object.entries(viewPathMap).map(([view, path]) => [path, view as View]),
)

const getViewFromPathname = (pathname: string): View => pathnameViewMap[pathname] ?? 'not-found'
const getPathFromView = (view: View): string => viewPathMap[view]

export default function Example() {
  const [currentView, setCurrentView] = useState<View>(() => getViewFromPathname(window.location.pathname))

  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(getViewFromPathname(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const navigateToView = (view: View) => {
    const nextPath = getPathFromView(view)

    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }

    setCurrentView(view)
  }

  const navigateHome = () => navigateToView('home')
  const navigateToMyAccount = () => navigateToView('my-account')
  const navigateToMemorize = () => navigateToView('memorize')

  const navigateByPath = (path: string) => {
    const view = getViewFromPathname(path)
    navigateToView(view)
  }

  return (
    <LanguageProvider>
      <Layout onNavigateHome={navigateHome} onNavigateToMyAccount={navigateToMyAccount} onNavigate={navigateByPath}>
        {currentView === 'home' ? <MainHero onNavigateToMemorize={navigateToMemorize} onNavigateToMyAccount={navigateToMyAccount} /> : null}
        {currentView === 'memorize' ? <Memorize /> : null}
        {currentView === 'my-account' ? <MyAccount /> : null}
        {currentView === 'about-me' ? <AboutMe /> : null}
        {currentView === 'faq' ? <Faq /> : null}
        {currentView === 'blog' ? <Blog /> : null}
        {currentView === 'contact' ? <Contact /> : null}
        {currentView === 'sign-up' ? <SignUp onNavigateHome={navigateHome} /> : null}
        {currentView === 'not-found' ? <NotFound onNavigateHome={navigateHome} onNavigateContact={() => navigateToView('contact')} /> : null}
      </Layout>
    </LanguageProvider>
  )
}
