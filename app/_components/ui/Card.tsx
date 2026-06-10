import { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

// Shared surface: white card with the standard radius + soft shadow. Pass
// `className` to override padding/width per use (default p-6).
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bg-white rounded-2xl shadow-sm p-6", className)} {...props} />
}
