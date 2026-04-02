import { Route, Routes, useLocation, useParams } from 'react-router-dom'
import { LanguageProvider, type Language } from './i18n/LanguageContext'
import Layout from './components/Layout'
import MainHero from './components/MainHero'
import Memorize from './pages/Memorize'
import MyAccount from './pages/MyAccount'
import Practice from './pages/Practice'
import AboutMe from './pages/AboutMe'
import Faq from './pages/Faq'
import Blog from './pages/Blog'
import Post from './pages/Post'
import Contact from './pages/Contact'
import NotFound from './pages/NotFound'
import SignUp from './pages/SignUp'

function PostPage() {
  const { slug } = useParams<{ slug: string }>()
  return slug ? <Post slug={slug} /> : <NotFound />
}

const pageRoutes = (
  <>
    <Route index element={<MainHero />} />
    <Route path="memorize" element={<Memorize />} />
    <Route path="practice" element={<Practice />} />
    <Route path="my-account" element={<MyAccount />} />
    <Route path="about-me" element={<AboutMe />} />
    <Route path="faq" element={<Faq />} />
    <Route path="blog" element={<Blog />} />
    <Route path="blog/:slug" element={<PostPage />} />
    <Route path="contact" element={<Contact />} />
    <Route path="sign-up" element={<SignUp />} />
    <Route path="*" element={<NotFound />} />
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
