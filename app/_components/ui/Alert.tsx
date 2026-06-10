import { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

// Inline alert box. Currently only the error treatment is used (form
// validation), but the variant map leaves room for success/warning later.
type Variant = "error" | "success" | "warning"

const variants: Record<Variant, string> = {
  error: "bg-red-50 border-red-200 text-red-600",
  success: "bg-green-50 border-green-200 text-green-700",
  warning: "bg-amber-50 border-amber-200 text-amber-700",
}

export function Alert({
  variant = "error",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: Variant }) {
  return (
    <div
      className={cn("border text-sm px-4 py-3 rounded-xl", variants[variant], className)}
      {...props}
    />
  )
}
