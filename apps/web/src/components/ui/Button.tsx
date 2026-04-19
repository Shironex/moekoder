import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Button visual variants mapped straight onto the existing `.btn` rules in
 * `primitives.css`. CVA stays thin here — the heavy lifting lives in CSS so
 * the runtime class list stays stable and easy to diff against the design.
 *
 * Size modifiers (`sm`/`lg`) mirror the `.btn.sm` / `.btn.lg` CSS classes.
 * The `icon` variant switches to the square icon-button rules used by the
 * titlebar (see `chrome.css` `.title-icon-btn`).
 */
export const buttonVariants = cva('', {
  variants: {
    variant: {
      default: 'btn',
      primary: 'btn primary',
      ghost: 'btn ghost',
      danger: 'btn danger',
      icon: 'title-icon-btn',
    },
    size: {
      default: '',
      sm: 'sm',
      lg: 'lg',
    },
  },
  compoundVariants: [
    // The icon variant ignores size modifiers — the titlebar owns its sizing.
    { variant: 'icon', size: 'sm', class: '' },
    { variant: 'icon', size: 'lg', class: '' },
  ],
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = 'Button';
