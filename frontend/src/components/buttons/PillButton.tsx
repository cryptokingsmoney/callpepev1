import React from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

export function PillButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const { variant = 'primary', className = '', ...rest } = props
  const cls =
    variant === 'primary' ? 'pill pillPrimary' :
    variant === 'danger' ? 'pill pillDanger' :
    'pill pillGhost'
  return <button className={`${cls} ${className}`} {...rest} />
}
