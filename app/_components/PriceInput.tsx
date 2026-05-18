"use client"

import { useState, useEffect } from "react"

function formatThousands(n: number | "") {
  if (n === "" || n === null || Number.isNaN(n as number)) return ""
  // 300000 -> "300.000"
  return Math.floor(n as number).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

// Numeric input that:
//   • allows the field to be completely empty (no stuck leading zero)
//   • shows thousands separator as dots while typing — e.g. 300.000
//   • emits the raw numeric value via onChange
export function PriceInput({
  value, onChange, className, placeholder, disabled, min = 0,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  min?: number
}) {
  const [text, setText] = useState(() => formatThousands(value))

  // Keep local text in sync when value prop changes externally (e.g. classType change)
  useEffect(() => {
    const formatted = formatThousands(value)
    if (formatted !== text.replace(/\./g, "").replace(/^$/, "0")) {
      setText(formatted)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9.]*"
      value={text}
      disabled={disabled}
      placeholder={placeholder ?? "0"}
      onChange={(e) => {
        // Strip everything that's not a digit, then re-format with dots
        const digits = e.target.value.replace(/\D/g, "")
        if (digits === "") {
          setText("")
          onChange(min) // emit min when empty (server still needs a number)
          return
        }
        const n = parseInt(digits, 10)
        // Drop leading zeros automatically (parseInt handles it)
        setText(formatThousands(n))
        onChange(n)
      }}
      onBlur={() => {
        // Normalize on blur — empty stays empty, otherwise re-format
        if (text !== "") setText(formatThousands(value))
      }}
      className={className}
    />
  )
}
