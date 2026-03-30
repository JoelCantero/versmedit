import { FormEvent, useState } from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiFetch } from '../api/client'
import FormInput from './FormInput'

type LoginModalProps = {
  open: boolean
  onClose: () => void
  onLoginSuccess: () => void
}

export default function LoginModal({ open, onClose, onLoginSuccess }: LoginModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await apiFetch('/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      })

      onLoginSuccess()
    } catch {
      setErrorMessage('Credenciales incorrectas. Intentalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-gray-900/50" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-900/10 dark:bg-gray-900 dark:ring-white/10">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Log in</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Use your email and password to continue.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <span className="sr-only">Close login modal</span>
              <XMarkIcon aria-hidden="true" className="size-5" />
            </button>
          </div>

          <form className="mt-6 space-y-4" method="post" autoComplete="on" onSubmit={handleSubmit}>
            <FormInput
              id="login-email"
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              spellCheck={false}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />

            <FormInput
              id="login-password"
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
            />

            {errorMessage ? <p className="text-sm font-medium text-red-600">{errorMessage}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {isSubmitting ? 'Logging in...' : 'Log in'}
            </button>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
