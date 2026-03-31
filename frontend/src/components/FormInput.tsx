import { InputHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

type FormInputProps = {
  id: string
  label: string
  containerClassName?: string
} & InputHTMLAttributes<HTMLInputElement>

export default function FormInput({ id, label, containerClassName, className, ...inputProps }: FormInputProps) {
  return (
    <div className={containerClassName}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        className={cn(
          'mt-1 block w-full rounded-full border border-border px-3 py-2 text-sm text-foreground shadow-xs',
          'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30',
          'dark:bg-muted',
          className,
        )}
        {...inputProps}
      />
    </div>
  )
}
