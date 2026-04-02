import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes, useLocation, useParams } from 'react-router-dom'
import { LanguageProvider, type Language } from './i18n/LanguageContext'
import Layout from './components/Layout'

// Lazy load all pages for code splitting and better performance
const MainHero = lazy(() => import('./components/MainHero'))
const Memorize = lazy(() => import('./pages/Memorize'))
const MyAccount = lazy(() => import('./pages/MyAccount'))
const Practice = lazy(() => import('./pages/Practice'))
const AboutMe = lazy(() => import('./pages/AboutMe'))
const Faq = lazy(() => import('./pages/Faq'))
const Blog = lazy(() => import('./pages/Blog'))
const Post = lazy(() => import('./pages/Post'))
const Contact = lazy(() => import('./pages/Contact'))
const NotFound = lazy(() => import('./pages/NotFound'))
const SignUp = lazy(() => import('./pages/SignUp'))

// Fallback component while pages are loading
function PageLoader() {
  return <div className="flex items-center justify-center min-h-screen">Loading...</div>
}

function withLoader(element: ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>
}

function PostPage() {
  const { slug } = useParams<{ slug: string }>()
  return slug ? <Post slug={slug} /> : <NotFound />
}

const pageRoutes = (
  <>
    <Route index element={withLoader(<MainHero />)} />
    <Route path="memorize" element={withLoader(<Memorize />)} />
    <Route path="practice" element={withLoader(<Practice />)} />
    <Route path="my-account" element={withLoader(<MyAccount />)} />
    <Route path="about" element={withLoader(<AboutMe />)} />
    <Route path="faq" element={withLoader(<Faq />)} />
    <Route path="blog" element={withLoader(<Blog />)} />
    <Route path="blog/:slug" element={withLoader(<PostPage />)} />
    <Route path="contact" element={withLoader(<Contact />)} />
    <Route path="sign-up" element={withLoader(<SignUp />)} />
    <Route path="*" element={withLoader(<NotFound />)} />
  </>
)

function AppShell() {
  const location = useLocation()
  const locale: Language = location.pathname === '/es' || location.pathname.startsWith('/es/') ? 'es' : 'en'

  return (
    <LanguageProvider urlLocale={locale}>
      <Layout />
    </LanguageProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="es">{pageRoutes}</Route>
        <Route path="/">{pageRoutes}</Route>
      </Route>
    </Routes>
  )
}
