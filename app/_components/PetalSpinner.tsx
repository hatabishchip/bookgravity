// Shared iOS-style petal spinner (12 fading petals). Styles live in
// globals.css (.petal-spinner). Use anywhere a list/section is loading so a
// page never flashes an empty state ("No bookings yet") before data arrives.
export function PetalSpinner({ className = "py-10" }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`} aria-label="Loading">
      <div className="petal-spinner" aria-hidden>
        {Array.from({ length: 12 }).map((_, i) => (
          <i
            key={i}
            style={{ transform: `rotate(${i * 30}deg)`, animationDelay: `${-(11 - i) / 12}s` }}
          />
        ))}
      </div>
    </div>
  )
}
