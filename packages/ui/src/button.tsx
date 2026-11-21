import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from './utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'senior';
  size?: 'default' | 'sm' | 'lg' | 'senior-xl';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    const baseStyles =
      'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none';

    const variantStyles = {
      primary: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500 shadow-sm',
      secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400',
      outline: 'border-2 border-slate-300 bg-white hover:bg-slate-50 focus-visible:ring-slate-400',
      danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500',
      ghost: 'hover:bg-slate-100 text-slate-700 focus-visible:ring-slate-300',
      // High contrast senior mode: 48px+ touch targets, clear tactile borders
      senior:
        'bg-blue-700 text-white hover:bg-blue-800 text-xl font-bold border-2 border-blue-900 shadow-md focus-visible:ring-blue-600 active:scale-[0.98]',
    };

    const sizeStyles = {
      default: 'h-11 px-4 py-2 text-base min-h-[44px] min-w-[44px]',
      sm: 'h-9 px-3 text-sm min-h-[40px]',
      lg: 'h-13 px-6 text-lg min-h-[48px] min-w-[48px]',
      // Senior Mode sizing: massive 60px height, 20px+ font
      'senior-xl': 'h-16 px-8 text-xl min-h-[60px] min-w-[60px] gap-3',
    };

    return (
      <Comp
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
