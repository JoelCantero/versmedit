import { FormEvent, useState } from 'react'
import { apiFetch } from '../api/client'
import Button from '../components/Button'
import FormInput from '../components/FormInput'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'

type SignUpProps = {
  onNavigateHome: () => void
}

export default function SignUp({ onNavigateHome }: SignUpProps) {
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
    } catch {
      setErrorMessage('Could not create account. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <PageShell>
        <PageHeader title="Account created" description="Your account has been created successfully." />
        <div className="mt-10 flex justify-center">
          <Button onClick={onNavigateHome}>Go back home</Button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader title="Sign up" description="Create your account to start memorizing Scripture." />
      <form className="mx-auto mt-10 max-w-sm space-y-4" method="post" autoComplete="on" onSubmit={handleSubmit}>
        <FormInput
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
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
          placeholder="Email"
        />

        <FormInput
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
        />

        {errorMessage ? <p className="text-sm font-medium text-destructive">{errorMessage}</p> : null}

        <Button type="submit" disabled={isSubmitting} className="w-full px-3.5 py-2.5">
          {isSubmitting ? 'Creating account...' : 'Sign up'}
        </Button>
      </form>
    </PageShell>
  )
}
