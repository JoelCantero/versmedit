import { useMemo, useState } from 'react'
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react'
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline'
import CategoryBadge, { toBadgeColor } from './CategoryBadge'
import { cn } from '../lib/utils'

const CREATE_OPTION_VALUE = '__create_new_option__'

export type FormInputSelectOption = {
  value: string
  label: string
  color?: string | null
}

type FormInputSelectProps = {
  id: string
  value: string
  inputValue?: string
  selectedColor?: string | null
  options: FormInputSelectOption[]
  onChange: (value: string) => void
  onInputValueChange?: (value: string) => void
  placeholder?: string
  containerClassName?: string
  inputClassName?: string
  optionsClassName?: string
  clearLabel?: string
}

export default function FormInputSelect({
  id,
  value,
  inputValue,
  selectedColor,
  options,
  onChange,
  onInputValueChange,
  placeholder,
  containerClassName,
  inputClassName,
  optionsClassName,
  clearLabel = 'Clear selected item',
}: FormInputSelectProps) {
  const [query, setQuery] = useState('')

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  )

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options

    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
  }, [options, query])

  const normalizedQuery = query.trim()
  const hasExactMatch = useMemo(
    () => options.some((option) => option.label.toLowerCase() === normalizedQuery.toLowerCase()),
    [options, normalizedQuery],
  )
  const canCreateFromQuery = Boolean(normalizedQuery) && !hasExactMatch

  const badgeColorValue = selectedColor ?? selectedOption?.color
  const createdBadgeLabel = !selectedOption && !normalizedQuery ? inputValue?.trim() ?? '' : ''
  const badgeLabel = selectedOption?.label ?? createdBadgeLabel

  return (
    <div className={containerClassName}>
      <Combobox
        value={selectedOption}
        onChange={(option) => {
          if (option?.value === CREATE_OPTION_VALUE) {
            onChange('')
            onInputValueChange?.(normalizedQuery)
            setQuery('')
            return
          }

          onChange(option?.value ?? '')
          onInputValueChange?.(option?.label ?? '')
          setQuery('')
        }}
        nullable
      >
        <div className="relative">
          <ComboboxInput
            id={id}
            className={cn(
              'block w-full rounded-full border-none bg-white/5 px-3 py-2 pr-16 text-sm/6 text-foreground',
              'focus:not-data-focus:outline-none data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-primary',
              badgeLabel ? 'text-transparent caret-transparent' : '',
              inputClassName,
            )}
            displayValue={(option: FormInputSelectOption | null) => option?.label ?? ''}
            value={inputValue ?? (query || selectedOption?.label || '')}
            onChange={(event) => {
              const nextValue = event.target.value
              setQuery(nextValue)
              onInputValueChange?.(nextValue)

              if (selectedOption && nextValue !== selectedOption.label) {
                onChange('')
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
          />
          {badgeLabel ? (
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center gap-1">
              <button
                type="button"
                aria-label={clearLabel}
                className="pointer-events-auto"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange('')
                  setQuery('')
                  onInputValueChange?.('')
                }}
              >
                <CategoryBadge color={toBadgeColor(badgeColorValue)}>
                  <span className="inline-flex items-center gap-1">
                    <span>{badgeLabel}</span>
                    <XMarkIcon aria-hidden="true" className="size-3.5" />
                  </span>
                </CategoryBadge>
              </button>
            </div>
          ) : null}
          <ChevronUpDownIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <ComboboxOptions
            anchor="bottom"
            portal
            className={cn(
              'z-[70] mt-2 max-h-56 w-[var(--input-width)] overflow-auto rounded-2xl border border-border bg-card p-1 shadow-lg empty:invisible',
              optionsClassName,
            )}
          >
            {filteredOptions.map((option) => (
              <ComboboxOption
                key={option.value}
                value={option}
                className="cursor-pointer rounded-xl px-3 py-2 text-sm text-foreground data-focus:bg-accent"
              >
                {option.label}
              </ComboboxOption>
            ))}
            {canCreateFromQuery ? (
              <ComboboxOption
                key={CREATE_OPTION_VALUE}
                value={{ value: CREATE_OPTION_VALUE, label: normalizedQuery }}
                className="cursor-pointer rounded-xl px-3 py-2 text-sm font-medium text-foreground data-focus:bg-accent"
              >
                + {normalizedQuery}
              </ComboboxOption>
            ) : null}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  )
}