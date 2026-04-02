import { Input } from '@headlessui/react'
import { InputHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

type FormInputProps = {
  id: string
  containerClassName?: string
} & InputHTMLAttributes<HTMLInputElement>

export default function FormInput({ id, containerClassName, className, ...inputProps }: FormInputProps) {
  return (
    <div className={containerClassName}>
      <Input
        id={id}
        className={cn(
          'block w-full rounded-full border-none bg-white/5 px-3 py-2 text-sm/6 text-foreground',
          'focus:not-data-focus:outline-none data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-primary',
          className,
        )}
        {...inputProps}
      />
    </div>
  )
}
