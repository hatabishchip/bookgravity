"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"

// Full-screen image viewer with zoom + pan.
//
// Why a portal to <body>: rendered inline, a `fixed inset-0` overlay is
// positioned relative to the nearest transformed/filtered ancestor (the
// floating inbox modal animates with transform), so the top got clipped.
// Portaling to <body> escapes that and gives us the true viewport — plus
// 100dvh so mobile browser chrome never crops the image.
//
// Interactions:
//   • wheel / pinch        → zoom (1×–5×)
//   • drag (when zoomed)   → pan
//   • double click / tap   → toggle 1× ↔ 2.5×
//   • buttons              → zoom in/out, reset
//   • backdrop / ✕ / Esc   → close
export default function ImageLightbox({
  src,
  onClose,
}: {
  src: string
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  // Active pointers (for pinch) + gesture start refs.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null)
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const movedRef = useRef(false)

  useEffect(() => setMounted(true), [])

  const clamp = (s: number) => Math.min(5, Math.max(1, s))
  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Snap pan back to centre whenever we return to 1×.
  useEffect(() => { if (scale === 1) { setTx(0); setTy(0) } }, [scale])

  const onWheel = (e: React.WheelEvent) => {
    setScale((s) => clamp(s - e.deltaY * 0.0015 * s))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    movedRef.current = false
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale }
      panStart.current = null
    } else if (pointers.current.size === 1 && scale > 1) {
      panStart.current = { x: e.clientX, y: e.clientY, tx, ty }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinchStart.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      setScale(clamp(pinchStart.current.scale * (dist / pinchStart.current.dist)))
      movedRef.current = true
    } else if (panStart.current) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true
      setTx(panStart.current.tx + dx)
      setTy(panStart.current.ty + dy)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    if (pointers.current.size === 0) panStart.current = null
  }

  // Double-tap closes the viewer (owner's request). Pinch / wheel / buttons zoom.
  const onDoubleClick = () => onClose()

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center overflow-hidden touch-none select-none animate-in fade-in"
      style={{ height: "100dvh", width: "100dvw" }}
      onClick={() => onClose()}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setScale((s) => clamp(s - 0.5))}
          aria-label="Zoom out"
          className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur"
        >
          <ZoomOut size={20} />
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => clamp(s + 0.5))}
          aria-label="Zoom in"
          className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur"
        >
          <ZoomIn size={20} />
        </button>
        {scale !== 1 && (
          <button
            type="button"
            onClick={reset}
            aria-label="Reset zoom"
            className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur"
          >
            <RotateCcw size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur"
        >
          <X size={22} />
        </button>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="full size"
        draggable={false}
        onClick={(e) => {
          e.stopPropagation()
          // A clean tap at 1× closes; a tap that was actually a drag does not.
          if (scale === 1 && !movedRef.current) onClose()
        }}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // Cap to the full-viewport parent (not dvh units, which some iOS
        // versions ignore — leaving the image unconstrained so it overflowed
        // and got clipped top/bottom). object-contain shows the whole image.
        className="max-w-full max-h-full object-contain"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          cursor: scale > 1 ? "grab" : "zoom-out",
          touchAction: "none",
        }}
      />
    </div>,
    document.body,
  )
}
