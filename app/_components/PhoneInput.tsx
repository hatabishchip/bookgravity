"use client"

import { useId } from "react"
import {
  detectCountry,
  formatPhoneInput,
  subscriberDigits,
  validatePhone,
} from "@/lib/phone"
import { cn } from "@/lib/utils"

// Reusable international phone input. Mirrors the visual behaviour of the
// booking widget's phone field — country flag + name beneath the field,
// red-highlight while invalid, blocks over-typing past the country's max
// subscriber length.
//
// Controlled component: pass `value`, get changes via `onChange`. Block save
// in the parent based on `isValid()` (or `validatePhone(value).kind === "ok"`).

export interface PhoneInputProps {
  value: string
  onChange: (next: string) => void
  /** Inline label text. Pass empty string to render without a label. */
  label?: string
  /** Marker the field is required (shown next to label). */
  required?: boolean
  /** Optional placeholder; default "+62 812 3456 7890". */
  placeholder?: string
  /** Disable the input. */
  disabled?: boolean
  /** Compact mode = smaller padding + font, for embedding in dense lists. */
  compact?: boolean
  /** Auto-focus on mount. */
  autoFocus?: boolean
  /** Extra className for the wrapper. */
  className?: string
  /** Called when the field loses focus (after the value has been committed). */
  onBlur?: (value: string) => void
  /** Hide the status / hint line under the input (country, digit count, tips). */
  hideHint?: boolean
  /** Extra classes for the <input> itself (e.g. larger font / tabular nums). */
  inputClassName?: string
}

export default function PhoneInput({
  value,
  onChange,
  label,
  required,
  placeholder = "+62 812 3456 7890",
  disabled,
  compact,
  autoFocus,
  className,
  onBlur,
  hideHint,
  inputClassName,
}: PhoneInputProps) {
  const id = useId()
  const validation = validatePhone(value)
  const country = detectCountry(value)
  // Only a genuinely wrong country code is an error (red). While the number is
  // still too short we stay neutral (no scary red mid-typing); a valid number
  // turns the field green.
  const isUnknown = validation.kind === "unknown_code"
  const isValid = validation.kind === "ok"

  return (
    <div className={cn("min-w-0", className)}>
      {label !== undefined && (
        <label
          htmlFor={id}
          className={cn(
            compact ? "text-xs" : "text-sm",
            "block font-medium text-gray-700 dark:text-gray-200 mb-1",
          )}
        >
          {label}
          {required && " *"}
        </label>
      )}
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onBlur={() => onBlur?.(value)}
        onPaste={(e) => {
          // Paste-friendly: the per-keystroke onChange below rejects anything
          // that isn't already a known country code, which silently drops
          // pasted local numbers (e.g. "0821-4554-6405"). Handle paste
          // explicitly: normalise to international and set it directly.
          const text = e.clipboardData.getData("text")
          if (!text) return
          e.preventDefault()
          const hasPlus = text.trim().startsWith("+")
          let digits = text.replace(/\D/g, "")
          if (!hasPlus && digits.startsWith("0")) {
            // National format → assume Indonesia (+62), the studios' country.
            digits = "62" + digits.replace(/^0+/, "")
          }
          const candidate = "+" + digits
          const c = detectCountry(candidate)
          onChange(c ? formatPhoneInput(candidate) : candidate)
        }}
        onChange={(e) => {
          const stripped = "+" + e.target.value.replace(/\D/g, "")
          const c = detectCountry(stripped)
          // Reject typing past the longest known country prefix when nothing matches.
          if (!c && stripped.replace(/\D/g, "").length > 3) return
          // Reject typing past the country's max subscriber digits.
          if (c && subscriberDigits(stripped, c) > c.max) return
          const formatted = c ? formatPhoneInput(stripped) : stripped
          onChange(formatted)
        }}
        placeholder={placeholder}
        className={cn(
          "w-full border rounded-xl focus:outline-none focus:ring-2 transition-colors",
          compact ? "px-3 py-1.5 text-xs" : "px-4 py-3 text-sm",
          isUnknown
            ? "border-red-400 focus:ring-red-200 focus:border-red-400 bg-red-50"
            : isValid
              ? "border-brand bg-brand/5 focus:ring-brand/30 focus:border-brand"
              : "border-gray-200 focus:ring-brand/30 focus:border-brand",
          disabled && "bg-gray-50 text-gray-400",
          inputClassName,
        )}
      />
      {/* Status row beneath the input — same layout as the booking widget. */}
      {hideHint ? null : validation.kind === "unknown_code" ? (
        <p className="text-xs text-red-500 mt-1">
          Unknown country code — start with a valid one, e.g. +62
        </p>
      ) : validation.kind === "too_short" ? (
        <p className="text-xs text-amber-500 mt-1">
          {validation.country.flag} {validation.country.name} · {validation.have} / {validation.country.min} digits
        </p>
      ) : validation.kind === "ok" ? (
        <p className="text-xs text-brand mt-1">
          {validation.country.flag} {validation.country.name} ✓
        </p>
      ) : country ? null : (
        <p className="text-xs text-gray-400 mt-1">
          Start with the country code, e.g. +62 for Indonesia
        </p>
      )}
    </div>
  )
}
