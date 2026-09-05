import { Link } from 'react-router-dom'
import type { ComponentProps, ReactNode } from 'react'
import s from './kit.module.css'

export function Panel({
  children,
  className,
  ...rest
}: { children: ReactNode } & ComponentProps<'div'>) {
  return (
    <div className={`${s.panel} ${className ?? ''}`} {...rest}>
      {children}
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'quiet'
type Size = 'md' | 'sm'

function classesFor(variant: Variant, size: Size, extra?: string) {
  const press = variant === 'quiet' ? '' : 'u-press'
  return `${s.btn} ${s[variant]} ${s[size]} ${press} ${extra ?? ''}`
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: { variant?: Variant; size?: Size } & ComponentProps<'button'>) {
  return <button type="button" className={classesFor(variant, size, className)} {...rest} />
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: { variant?: Variant; size?: Size } & ComponentProps<typeof Link>) {
  return <Link className={classesFor(variant, size, className)} {...rest} />
}

