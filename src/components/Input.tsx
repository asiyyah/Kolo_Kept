"use client";

import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", leftIcon, rightIcon, style, ...props }, ref) => {
    return (
      <div className="relative">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--text-tertiary)]">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          className={`w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
          style={{
            paddingLeft: leftIcon ? "2.25rem" : undefined,
            paddingRight: rightIcon ? "2.25rem" : undefined,
            ...style,
          }}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--text-tertiary)]">
            {rightIcon}
          </div>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export default Input;
