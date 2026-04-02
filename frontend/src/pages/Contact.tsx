import Button from '../components/Button'
import FormInput from '../components/FormInput'
import FormTextArea from '../components/FormTextArea'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'

export default function Contact() {
  return (
    <PageShell>
      <PageHeader
        title="Contact"
        description="Have questions or feedback? Fill out the form below and we'll get back to you."
      />
      <form action="#" method="POST" className="mx-auto mt-16 max-w-xl sm:mt-20">
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          <div>
            <FormInput
              id="first-name"
              name="first-name"
              type="text"
              autoComplete="given-name"
              placeholder="First name"
            />
          </div>
          <div>
            <FormInput
              id="last-name"
              name="last-name"
              type="text"
              autoComplete="family-name"
              placeholder="Last name"
            />
          </div>
          <div className="sm:col-span-2">
            <FormInput
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Email"
            />
          </div>
          <div className="sm:col-span-2">
            <FormTextArea
              id="message"
              name="message"
              rows={4}
              placeholder="Message"
            />
          </div>
          <div className="flex gap-x-4 sm:col-span-2">
            <div className="flex h-6 items-center">
              <div className="group relative inline-flex w-8 shrink-0 rounded-full bg-white/5 p-px inset-ring inset-ring-white/10 outline-offset-2 outline-primary transition-colors duration-200 ease-in-out has-checked:bg-primary has-focus-visible:outline-2">
                <span className="size-4 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-3.5" />
                <input
                  id="agree-to-policies"
                  name="agree-to-policies"
                  type="checkbox"
                  aria-label="Agree to policies"
                  className="absolute inset-0 size-full appearance-none focus:outline-hidden"
                />
              </div>
            </div>
            <label htmlFor="agree-to-policies" className="text-sm/6 text-muted-foreground">
              By selecting this, you agree to our{' '}
              <a href="#" className="font-semibold whitespace-nowrap text-indigo-400">
                privacy policy
              </a>
              .
            </label>
          </div>
        </div>
        <div className="mt-10">
          <Button type="submit" className="w-full px-3.5 py-2.5">
            Let's talk
          </Button>
        </div>
      </form>
    </PageShell>
  )
}
