import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export function Btn({ variant = 'primary', className = '', ...props }: Props) {
  return (
    <button
      {...props}
      className={`
        px-3 py-1.5 rounded font-medium text-sm
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variant === 'primary' 
          ? 'bg-orange-600 text-white hover:bg-orange-700 active:bg-orange-800' 
          : 'bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500'
        }
        ${className}
      `}
    />
  );
}