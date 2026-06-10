"use client"

import { InputHTMLAttributes, useId } from "react"
import { cn } from "@/lib/utils"

// Shared text input with an optional label. Encodes the brand focus ring +
// border treatment used on every form so it stays consistent.
const fieldClasses =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"

export function Input({
  label,
  id,
  className,
  wrapperClassName,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; wrapperClassName?: string }) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <input id={inputId} className={cn(fieldClasses, className)} {...props} />
    </div>
  )
}
