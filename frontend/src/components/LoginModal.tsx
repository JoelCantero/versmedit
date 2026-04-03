import { FormEvent, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiFetch } from '../api/client'
import { useTranslation } from '../i18n/LanguageContext'
import FormInput from './FormInput'
import Button from './Button'
import Modal from './Modal'

type LoginModalProps = {
  open: boolean
  onClose: () => void
  onLoginSuccess: () => void
  onNavigateToSignUp: () => void
}

export default function LoginModal({ open, onClose, onLoginSuccess, onNavigateToSignUp }: LoginModalProps) {
  const { t } = useTranslation()
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
      setErrorMessage(t('login.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} panelClassName="sm:max-w-md">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{t('login.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('login.notMember')}{' '}
              <button
                type="button"
                onClick={onNavigateToSignUp}
                className="cursor-pointer font-semibold text-primary hover:text-primary/80"
              >
                {t('login.signUpLink')}
              </button>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <span className="sr-only">{t('login.srClose')}</span>
            <XMarkIcon aria-hidden="true" className="size-5" />
          </button>
        </div>

        <form className="mt-6 space-y-4" method="post" autoComplete="on" onSubmit={handleSubmit}>
          <FormInput
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('login.email')}
          />

          <FormInput
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('login.password')}
          />

          {errorMessage ? <p className="text-sm font-medium text-destructive">{errorMessage}</p> : null}

          <Button type="submit" disabled={isSubmitting} className="w-full px-3.5 py-2.5">
            {isSubmitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </div>
    </Modal>
  )
}
