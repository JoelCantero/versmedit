'use client'

import { useEffect, useState } from 'react'
import { LanguageProvider } from './i18n/LanguageContext'
import Layout from './components/Layout'
import MainHero from './components/MainHero'
import Memorize from './pages/Memorize'
import MyAccount from './pages/MyAccount'
import Practice from './pages/Practice'
import AboutMe from './pages/AboutMe'
import Faq from './pages/Faq'
import Blog from './pages/Blog'
import PostDetail from './pages/PostDetail'
import Contact from './pages/Contact'
import NotFound from './pages/NotFound'
import SignUp from './pages/SignUp'

type View = 'home' | 'memorize' | 'practice' | 'my-account' | 'about-me' | 'faq' | 'blog' | 'blog-post' | 'contact' | 'sign-up' | 'not-found'

const viewPathMap: Record<View, string> = {
  home: '/',
  memorize: '/memorize',
  practice: '/practice',
  'my-account': '/my-account',
  'about-me': '/about-me',
  faq: '/faq',
  blog: '/blog',
  'blog-post': '/blog/:slug',
  contact: '/contact',
  'sign-up': '/sign-up',
  'not-found': '/not-found',
}

type RouteState = {
  view: View
  slug?: string
}

const parsePathname = (pathname: string): RouteState => {
  if (pathname === '/') return { view: 'home' }
  if (pathname === '/memorize') return { view: 'memorize' }
  if (pathname === '/practice') return { view: 'practice' }
  if (pathname === '/my-account') return { view: 'my-account' }
  if (pathname === '/about-me') return { view: 'about-me' }
  if (pathname === '/faq') return { view: 'faq' }
  if (pathname === '/blog') return { view: 'blog' }
  if (pathname.startsWith('/blog/')) {
    const slug = pathname.slice(6) // Remove '/blog/' prefix
    return { view: 'blog-post', slug }
  }
  if (pathname === '/contact') return { view: 'contact' }
  if (pathname === '/sign-up') return { view: 'sign-up' }
  return { view: 'not-found' }
}

const pathnameViewMap = Object.fromEntries(
  Object.entries(viewPathMap).map(([view, path]) => [path, view as View]),
)

const getViewFromPathname = (pathname: string): View => pathnameViewMap[pathname] ?? 'not-found'
const getPathFromView = (view: View, slug?: string): string => {
  if (view === 'blog-post' && slug) {
    return `/blog/${encodeURIComponent(slug)}`
  }
  return viewPathMap[view]
}

export default function Example() {
  const [routeState, setRouteState] = useState<RouteState>(() => parsePathname(window.location.pathname))

  useEffect(() => {
    const handlePopState = () => {
      setRouteState(parsePathname(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const navigateToView = (view: View, slug?: string) => {
    const nextPath = getPathFromView(view, slug)

    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }

    setRouteState({ view, slug })
  }

  const navigateHome = () => navigateToView('home')
  const navigateToMyAccount = () => navigateToView('my-account')
  const navigateToMemorize = () => navigateToView('memorize')
  const navigateToBlogPost = (slug: string) => navigateToView('blog-post', slug)
  const navigateToBlogs = () => navigateToView('blog')

  const navigateByPath = (path: string) => {
    const state = parsePathname(path)
    setRouteState(state)
  }

  const { view, slug } = routeState

  return (
    <LanguageProvider>
      <Layout onNavigateHome={navigateHome} onNavigateToMyAccount={navigateToMyAccount} onNavigate={navigateByPath}>
        {view === 'home' ? <MainHero onNavigateToMemorize={navigateToMemorize} onNavigateToMyAccount={navigateToMyAccount} /> : null}
        {view === 'memorize' ? <Memorize /> : null}
        {view === 'practice' ? <Practice /> : null}
        {view === 'my-account' ? <MyAccount /> : null}
        {view === 'about-me' ? <AboutMe /> : null}
        {view === 'faq' ? <Faq /> : null}
        {view === 'blog' ? <Blog onSelectPost={navigateToBlogPost} /> : null}
        {view === 'blog-post' && slug ? <PostDetail slug={slug} onBack={navigateToBlogs} /> : null}
        {view === 'contact' ? <Contact /> : null}
        {view === 'sign-up' ? <SignUp onNavigateHome={navigateHome} /> : null}
        {view === 'not-found' ? <NotFound onNavigateHome={navigateHome} onNavigateContact={() => navigateToView('contact')} /> : null}
      </Layout>
    </LanguageProvider>
  )
}
