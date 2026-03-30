'use client'

import { Suspense, lazy, useEffect, useState } from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, MoonIcon, SunIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { apiFetch } from '../api/client'

const LoginModal = lazy(() => import('./LoginModal'))

const navigation = [
  { name: 'Product', href: '#' },
  { name: 'Features', href: '#' },
  { name: 'Marketplace', href: '#' },
  { name: 'Company', href: '#' },
]

export default function HeaderNavigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isDark, setIsDark] = useState(false)

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

  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8">
        <div className="flex lg:flex-1">
          <a href="#" className="-m-1.5 p-1.5">
            <span className="sr-only">Your Company</span>
            <img
              alt=""
              src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
              className="h-8 w-auto"
            />
          </a>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700 dark:text-gray-200"
          >
            <span className="sr-only">Open main menu</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>
        </div>
        <div className="hidden lg:flex lg:gap-x-12">
          {navigation.map((item) => (
            <a key={item.name} href={item.href} className="text-sm/6 font-semibold text-gray-900 dark:text-gray-100">
              {item.name}
            </a>
          ))}
        </div>
        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-6">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center text-gray-900 dark:text-gray-100"
          >
            <span className="sr-only">Toggle theme</span>
            {isDark ? <MoonIcon aria-hidden="true" className="size-5" /> : <SunIcon aria-hidden="true" className="size-5" />}
          </button>
          <button type="button" onClick={openLoginModal} className="text-sm/6 font-semibold text-gray-900 dark:text-gray-100">
            {isAuthenticated ? 'My Account' : 'Log in'}
            {!isAuthenticated ? <span aria-hidden="true"> &rarr;</span> : null}
          </button>
        </div>
      </nav>
      <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
        <div className="fixed inset-0 z-50" />
        <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white p-6 dark:bg-gray-900 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10 dark:sm:ring-white/10">
          <div className="flex items-center justify-between">
            <a href="#" className="-m-1.5 p-1.5">
              <span className="sr-only">Your Company</span>
              <img
                alt=""
                src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
                className="h-8 w-auto"
              />
            </a>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="-m-2.5 rounded-md p-2.5 text-gray-700 dark:text-gray-200"
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-gray-500/10 dark:divide-gray-500/30">
              <div className="space-y-2 py-6">
                {navigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    {item.name}
                  </a>
                ))}
              </div>
              <div className="py-6">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="-mx-3 inline-flex items-center rounded-lg px-3 py-2.5 text-base/7 font-semibold text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  <span className="sr-only">Toggle theme</span>
                  {isDark ? <MoonIcon aria-hidden="true" className="size-5" /> : <SunIcon aria-hidden="true" className="size-5" />}
                </button>
                <button
                  type="button"
                  onClick={openLoginModal}
                  className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  {isAuthenticated ? 'My Account' : 'Log in'}
                </button>
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
          />
        </Suspense>
      ) : null}
    </header>
  )
}
