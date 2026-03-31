'use client'

import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import MainHero from './components/MainHero'
import Memorize from './pages/Memorize'
import MyAccount from './pages/MyAccount'

type View = 'home' | 'memorize' | 'my-account'

const getViewFromPathname = (pathname: string): View => {
  if (pathname === '/memorize') {
    return 'memorize'
  }

  if (pathname === '/my-account') {
    return 'my-account'
  }

  return 'home'
}

const getPathFromView = (view: View): string => {
  if (view === 'memorize') {
    return '/memorize'
  }

  if (view === 'my-account') {
    return '/my-account'
  }

  return '/'
}

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

  return (
    <Layout onNavigateHome={navigateHome} onNavigateToMyAccount={navigateToMyAccount}>
      {currentView === 'home' ? <MainHero onNavigateToMemorize={navigateToMemorize} onNavigateToMyAccount={navigateToMyAccount} /> : null}
      {currentView === 'memorize' ? <Memorize /> : null}
      {currentView === 'my-account' ? <MyAccount /> : null}
    </Layout>
  )
}
