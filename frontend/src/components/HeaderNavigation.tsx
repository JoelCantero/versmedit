'use client'

import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, ChevronDownIcon, MoonIcon, SunIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { apiFetch } from '../api/client'
import { useTranslation } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations/en'
import Dropdown from './Dropdown'
import LanguageSelector from './LanguageSelector'

const LoginModal = lazy(() => import('./LoginModal'))

const navigation: { labelKey: TranslationKey; path: string }[] = [
  { labelKey: 'nav.about', path: '/about' },
  { labelKey: 'nav.faq', path: '/faq' },
  { labelKey: 'nav.blog', path: '/blog' },
  { labelKey: 'nav.contact', path: '/contact' },
]

export default function HeaderNavigation() {
  const { t, localePath } = useTranslation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [isMobileAccountOpen, setIsMobileAccountOpen] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const savedTheme = window.localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldUseDark = savedTheme ? savedTheme === 'dark' : prefersDark

    root.classList.toggle('dark', shouldUseDark)
    setIsDark(shouldUseDark)
  }, [])

  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await apiFetch<{ session: { id: string } } | null>('/auth/get-session')
        setIsAuthenticated(Boolean(session?.session?.id))
      } catch {
        setIsAuthenticated(false)
      }
    }

    void checkSession()
  }, [])

  const openLoginModal = () => {
    if (isAuthenticated) {
      return
    }

    setMobileMenuOpen(false)
    setLoginModalOpen(true)
  }

  const toggleTheme = () => {
    const root = document.documentElement
    const nextIsDark = !isDark

    root.classList.toggle('dark', nextIsDark)
    window.localStorage.setItem('theme', nextIsDark ? 'dark' : 'light')
    setIsDark(nextIsDark)
  }

  const handleNavigateHome = () => {
    setMobileMenuOpen(false)
    navigate(localePath('/'))
  }

  const handleNavigateToMyAccount = () => {
    setMobileMenuOpen(false)
    navigate(localePath('/my-account'))
  }

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        throw new Error('Logout failed')
      }

      setIsAuthenticated(false)
      setMobileMenuOpen(false)
      navigate(localePath('/'))
    } catch {
      // Keep current session state if logout fails.
    }
  }

  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8">
        <div className="flex lg:flex-1">
          <button type="button" onClick={handleNavigateHome} className="cursor-pointer -m-1.5 p-1.5">
            <span className="sr-only">{t('nav.srCompanyLogo')}</span>
            <img
              alt=""
              src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
              className="h-8 w-auto"
            />
          </button>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-m-2.5 inline-flex items-center justify-center rounded-full p-2.5 text-foreground"
          >
            <span className="sr-only">{t('nav.srOpenMenu')}</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>
        </div>
        <div className="hidden lg:flex lg:gap-x-12">
          {navigation.map((item) => (
            <button key={item.labelKey} type="button" onClick={() => { setMobileMenuOpen(false); navigate(localePath(item.path)) }} className="cursor-pointer text-sm/6 font-semibold text-foreground">
              {t(item.labelKey)}
            </button>
          ))}
          {isAuthenticated ? (
            <>
              <button type="button" onClick={() => navigate(localePath('/memorize'))} className="cursor-pointer text-sm/6 font-semibold text-foreground">
                {t('nav.memorize')}
              </button>
              <button type="button" onClick={() => navigate(localePath('/practice'))} className="cursor-pointer text-sm/6 font-semibold text-foreground">
                {t('nav.practice')}
              </button>
            </>
          ) : null}
        </div>
        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-6">
          <button
            type="button"
            onClick={toggleTheme}
            className="cursor-pointer inline-flex items-center text-foreground"
          >
            <span className="sr-only">{t('nav.srToggleTheme')}</span>
            {isDark ? <MoonIcon aria-hidden="true" className="size-5" /> : <SunIcon aria-hidden="true" className="size-5" />}
          </button>
          <LanguageSelector />
          {isAuthenticated ? (
            <Dropdown
              label={t('nav.myAccount')}
              items={[
                { label: t('nav.myVerses'), onClick: () => navigate(localePath('/my-verses')) },
                { label: t('nav.viewAccount'), onClick: handleNavigateToMyAccount },
                { label: t('nav.logout'), onClick: handleLogout },
              ]}
            />
          ) : (
            <button type="button" onClick={openLoginModal} className="cursor-pointer text-sm/6 font-semibold text-foreground">
              {t('nav.logIn')} <span aria-hidden="true"> &rarr;</span>
            </button>
          )}
        </div>
      </nav>
      <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
        <div className="fixed inset-0 z-50" />
        <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-card p-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10 dark:sm:ring-white/10">
          <div className="flex items-center justify-between">
            <button type="button" onClick={handleNavigateHome} className="cursor-pointer -m-1.5 p-1.5">
              <span className="sr-only">{t('nav.srCompanyLogo')}</span>
              <img
                alt=""
                src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
                className="h-8 w-auto"
              />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="-m-2.5 rounded-full p-2.5 text-foreground"
            >
              <span className="sr-only">{t('nav.srCloseMenu')}</span>
              <XMarkIcon aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-gray-500/10 dark:divide-gray-500/30">
              <div className="space-y-2 py-6">
                {navigation.map((item) => (
                  <button
                    key={item.labelKey}
                    type="button"
                    onClick={() => { setMobileMenuOpen(false); navigate(localePath(item.path)) }}
                    className="-mx-3 block rounded-full px-3 py-2 text-base/7 font-semibold text-foreground hover:bg-accent"
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
                {isAuthenticated ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setMobileMenuOpen(false); navigate(localePath('/memorize')) }}
                      className="-mx-3 block rounded-full px-3 py-2 text-base/7 font-semibold text-foreground hover:bg-accent"
                    >
                      {t('nav.memorize')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMobileMenuOpen(false); navigate(localePath('/practice')) }}
                      className="-mx-3 block rounded-full px-3 py-2 text-base/7 font-semibold text-foreground hover:bg-accent"
                    >
                      {t('nav.practice')}
                    </button>
                  </>
                ) : null}
              </div>
              <div className="py-6">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="-mx-3 inline-flex items-center rounded-full px-3 py-2.5 text-base/7 font-semibold text-foreground hover:bg-accent"
                >
                  <span className="sr-only">{t('nav.srToggleTheme')}</span>
                  {isDark ? <MoonIcon aria-hidden="true" className="size-5" /> : <SunIcon aria-hidden="true" className="size-5" />}
                </button>
                <div className="-mx-3 px-3 py-2">
                  <LanguageSelector />
                </div>
                {isAuthenticated ? (
                  <div className="-mx-3">
                    <button
                      type="button"
                      onClick={() => setIsMobileAccountOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between rounded-full py-2 pr-3.5 pl-3 text-base/7 font-semibold text-foreground hover:bg-accent"
                    >
                      {t('nav.myAccount')}
                      <ChevronDownIcon
                        aria-hidden="true"
                        className={`size-5 flex-none transition-transform ${isMobileAccountOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isMobileAccountOpen ? (
                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => { setMobileMenuOpen(false); navigate(localePath('/my-verses')) }}
                          className="block w-full rounded-full py-2 pr-3 pl-6 text-left text-sm/7 font-semibold text-foreground hover:bg-accent"
                        >
                          {t('nav.myVerses')}
                        </button>
                        <button
                          type="button"
                          onClick={handleNavigateToMyAccount}
                          className="block w-full rounded-full py-2 pr-3 pl-6 text-left text-sm/7 font-semibold text-foreground hover:bg-accent"
                        >
                          {t('nav.viewAccount')}
                        </button>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="block w-full rounded-full py-2 pr-3 pl-6 text-left text-sm/7 font-semibold text-foreground hover:bg-accent"
                        >
                          {t('nav.logout')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openLoginModal}
                    className="-mx-3 block rounded-full px-3 py-2.5 text-base/7 font-semibold text-foreground hover:bg-accent"
                  >
                    {t('nav.logIn')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </DialogPanel>
      </Dialog>
      {loginModalOpen ? (
        <Suspense fallback={null}>
          <LoginModal
            open={loginModalOpen}
            onClose={() => setLoginModalOpen(false)}
            onLoginSuccess={() => {
              setIsAuthenticated(true)
              setLoginModalOpen(false)
            }}
            onNavigateToSignUp={() => {
              setLoginModalOpen(false)
              navigate(localePath('/sign-up'))
            }}
          />
        </Suspense>
      ) : null}
    </header>
  )
}
