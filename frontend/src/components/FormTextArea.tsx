import { Textarea } from '@headlessui/react'
import { TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

type FormTextAreaProps = {
  id: string
  containerClassName?: string
} & TextareaHTMLAttributes<HTMLTextAreaElement>

export default function FormTextArea({ id, containerClassName, className, ...textareaProps }: FormTextAreaProps) {
  return (
    <div className={containerClassName}>
      <Textarea
        id={id}
        className={cn(
          'block w-full resize-none rounded-2xl border-none bg-white/5 px-3 py-2 text-sm/6 text-foreground',
          'focus:not-data-focus:outline-none data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-primary',
          className,
        )}
        {...textareaProps}
      />
    </div>
  )
}
