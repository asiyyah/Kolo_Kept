"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import Input from "./Input";

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
}

export default function PasswordInput({
  leftIcon,
  ...props
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <Input
      type={show ? "text" : "password"}
      leftIcon={leftIcon}
      rightIcon={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow(!show)}
          className="flex items-center justify-center text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      }
      {...props}
    />
  );
}
