import { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

// Shared button. Encodes the brand button styles that were copy-pasted across
// the app so a tweak happens in one place. `variant` picks the colour
// treatment, `fullWidth` stretches it (the common form-submit case).
type Variant = "primary" | "secondary" | "ghost"

const base =
  "inline-flex items-center justify-center rounded-xl font-semibold text-sm px-4 py-3 " +
  "transition-colors disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation"

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-gray-200 text-gray-700 hover:bg-gray-50",
  ghost: "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
}

export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; fullWidth?: boolean }) {
  return (
    <button className={cn(base, variants[variant], fullWidth && "w-full", className)} {...props} />
  )
}
