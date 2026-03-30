import { InputHTMLAttributes } from 'react'

type FormInputProps = {
  id: string
  label: string
  containerClassName?: string
} & InputHTMLAttributes<HTMLInputElement>

export default function FormInput({ id, label, containerClassName, className, ...inputProps }: FormInputProps) {
  const defaultInputClasses =
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-white'

  return (
    <div className={containerClassName}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}
      </label>
      <input id={id} className={className ? `${defaultInputClasses} ${className}` : defaultInputClasses} {...inputProps} />
    </div>
  )
}
