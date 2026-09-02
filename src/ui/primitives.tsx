import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Icon, type IconName } from './Icon.tsx'

/* --- Button --- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  iconBefore?: IconName
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', iconBefore, className, children, type, ...rest },
  ref,
) {
  const classes = [
    'vi-btn',
    `vi-btn--${variant}`,
    size === 'sm' ? 'vi-btn--sm' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button ref={ref} className={classes} type={type ?? 'button'} {...rest}>
      {iconBefore ? <Icon name={iconBefore} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  )
})

/* --- IconButton --- */

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName
  label: string
}

export function IconButton({ icon, label, className, type, ...rest }: IconButtonProps) {
  return (
    <button
      className={['vi-iconbtn', className].filter(Boolean).join(' ')}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={18} />
    </button>
  )
}

/* --- Field wrapper --- */

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="vi-field">
      <label className="vi-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="vi-hint">{hint}</p> : null}
      {error ? (
        <p className="vi-error-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/* --- Input / Textarea / Select --- */

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...rest }, ref) {
  return (
    <input ref={ref} className={['vi-input', className].filter(Boolean).join(' ')} {...rest} />
  )
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={['vi-textarea', className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
})

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={['vi-select', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </select>
  )
})

/* --- SearchInput --- */

export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search...',
  label = 'Search',
}: {
  value: string
  onChange: (next: string) => void
  onSubmit?: () => void
  placeholder?: string
  label?: string
}) {
  return (
    <form
      className="vi-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
    >
      <span className="vi-search__icon">
        <Icon name="search" size={16} />
      </span>
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </form>
  )
}

/* --- SegmentedControl --- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; icon?: IconName }[]
  value: T
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div className="vi-segmented" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="vi-segmented__opt"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon ? <Icon name={opt.icon} size={14} /> : null}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* --- Badge / Chip --- */

export function Badge({
  children,
  variant = 'default',
}: {
  children: ReactNode
  variant?: 'default' | 'accent' | 'success'
}) {
  return (
    <span
      className={['vi-badge', variant !== 'default' ? `vi-badge--${variant}` : null]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}

export function Chip({
  children,
  onRemove,
}: {
  children: ReactNode
  onRemove?: () => void
}) {
  if (!onRemove) {
    return <span className="vi-chip">{children}</span>
  }
  return (
    <button type="button" className="vi-chip" onClick={onRemove}>
      {children}
      <span className="vi-chip__x" aria-hidden="true">
        <Icon name="close" size={12} />
      </span>
      <span className="vi-visually-hidden">Remove</span>
    </button>
  )
}

/* --- RatingControl --- */

export function RatingControl({
  value,
  onChange,
  readOnly = false,
}: {
  value: number | null
  onChange?: (next: number | null) => void
  readOnly?: boolean
}) {
  const rounded = value ?? 0
  if (readOnly) {
    return (
      <span className="vi-rating" role="img" aria-label={`Rated ${rounded} of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="vi-rating__star" data-on={n <= rounded} aria-hidden="true">
            *
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className="vi-rating" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="vi-rating__star"
          data-on={n <= rounded}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={n === rounded}
          onClick={() => onChange?.(n === value ? null : n)}
        >
          *
        </button>
      ))}
    </span>
  )
}

/* --- Container --- */

export function Container({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div
      style={{
        maxWidth: wide ? 'var(--width-wide)' : 'var(--width-content)',
        marginInline: 'auto',
        width: '100%',
      }}
    >
      {children}
    </div>
  )
}
