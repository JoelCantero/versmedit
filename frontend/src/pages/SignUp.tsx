import { FormEvent, useState } from 'react'
import { ApiError, apiFetch } from '../api/client'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import { useTranslation } from '../i18n/LanguageContext'

type SignUpProps = {
  onNavigateHome: () => void
}

export default function SignUp({ onNavigateHome }: SignUpProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await apiFetch('/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      })

      setIsSuccess(true)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
        setErrorMessage(t('signUp.userExists'))
      } else {
        setErrorMessage(t('signUp.error'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <PageShell>
        <PageHeader title={t('signUp.successTitle')} description={t('signUp.successDescription')} />
        <div className="mt-10 flex justify-center">
          <Button onClick={onNavigateHome}>{t('signUp.goHome')}</Button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader title={t('signUp.title')} description={t('signUp.description')} />
      <form className="mx-auto mt-10 max-w-sm space-y-4" method="post" autoComplete="on" onSubmit={handleSubmit}>
        <FormInput
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('signUp.name')}
        />

        <FormInput
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('signUp.email')}
        />

        <FormInput
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t('signUp.password')}
        />

        {errorMessage ? <p className="text-sm font-medium text-destructive">{errorMessage}</p> : null}

        <Button type="submit" disabled={isSubmitting} className="w-full px-3.5 py-2.5">
          {isSubmitting ? t('signUp.submitting') : t('signUp.submit')}
        </Button>
      </form>
    </PageShell>
  )
}
