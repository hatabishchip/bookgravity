"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { CalendarX, Keyboard, Loader2, MessageSquareText, Send, Smile } from "lucide-react"
import { format, parseISO } from "date-fns"
import { cn } from "@/lib/utils"
import VirtualKeyboard, { type VirtualKeyboardHandle } from "@/app/_components/VirtualKeyboard"
import StickerPicker from "@/app/_components/StickerPicker"

// Canned staff messages ("quick replies"). Picking one drops the text into the
// composer so staff can tweak it (e.g. add the new time) before sending. When
// the 24h customer-service window is CLOSED the send path wraps the text in the
// approved `admin_message` template, so these still reach a client who has gone
// quiet - which is exactly when a schedule change needs to be sent.
type QuickReply = { id: string; label: string; text: string; needsTime?: boolean }
const QUICK_REPLIES: QuickReply[] = [
  {
    id: "schedule-update",
    label: "Schedule update",
    // {time} is filled from a slot the trainer PICKS (no manual typing) - see
    // the time picker. Wording change confirmed with the owner 14.07.
    text: "Greetings!\n\nWe have a small schedule update. Your session has been moved to {time}. See you there!",
    needsTime: true,
  },
]

// ---------------------------------------------------------------------------
// Inbox composer (pill input + virtual keyboard).
//
// Performance note: the textarea is *uncontrolled* — its value lives in the
// DOM, not in React state. Every key press is a single DOM mutation, which
// is much faster than the previous setText(...) approach that re-rendered
// the whole Inbox (chat list + thread + composer) on every character.
//
// React state is only used for two boolean flags (hasText, sending) which
// toggle a handful of times per send cycle, so virtual-keyboard input feels
// instant even when typing very fast or holding backspace.
// ---------------------------------------------------------------------------

export interface ComposerProps {
  /** Called when the Send button (or programmatic send) fires with non-empty text. */
  onSend: (text: string) => Promise<void> | void
  /** Called when the user picks a photo/video via the "+" button. */
  onAttach?: (file: File) => Promise<void> | void
  /** Current font scale for the composer text and 3-line cap calculations. */
  fontScale: number
  /** Which user role is viewing — drives the default keyboard language
   *  (admin ru, trainer en) and the trainer-only 👋 wave. Both roles get the
   *  "+" attach button and the emoji/sticker picker. */
  role: "ADMIN" | "TRAINER"
  /** Send a Meta-approved template (works outside the 24h window). When
   *  provided, picking a quick-reply template sends it via this path instead
   *  of filling the text input. */
  onSendTemplate?: (t: {
    templateName: string
    languageCode?: string
    variables?: string[]
    display?: string
  }) => Promise<void> | void
  /** The client's saved name — used to personalise the greeting template. */
  clientName?: string | null
  /** TRAINER-only: send a 👋 wave to the chat. When provided, the trainer
   *  composer shows ONLY this button (no attach / stickers / templates). */
  onWave?: () => void
  /** TRAINER-only: greys out the wave button during its 12h cooldown. */
  waveDisabled?: boolean
  /** True while the 24h customer-service window is open (the client has
   *  written within 24h). When closed, free text can't reach the client —
   *  only an approved template/wave can — so the text field is shown muted. */
  windowOpen?: boolean
  /** MOBILE WhatsApp-style keyboard visibility. When false the on-screen
   *  keyboard/sticker panel is hidden (more room for messages); tapping the
   *  input opens it, scrolling the thread closes it. Desktop ignores this. */
  keyboardOpen?: boolean
  /** Notify the parent to open/close the on-screen keyboard. */
  onKeyboardOpenChange?: (open: boolean) => void
  /** MOBILE: report the on-screen keyboard's natural pixel height so the parent
   *  can drive the interactive (finger-tracked) show/hide via a CSS variable. */
  onKbHeight?: (height: number) => void
  /** When set, shows the calendar-x "class action" button (move/cancel the
   *  client's booking right from the chat). Gated per studio by the parent. */
  onClassAction?: () => void
}

export default function Composer({ onSend, onAttach, fontScale, role, onSendTemplate, onWave, waveDisabled, windowOpen = true, keyboardOpen = true, onKeyboardOpenChange, onKbHeight, onClassAction }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // On-screen keyboard handle — we report the text before the caret after
  // every mutation so it can arm auto-capitalization (start of message,
  // after ". "). Imperative on purpose: no per-keystroke React re-renders.
  const kbRef = useRef<VirtualKeyboardHandle>(null)
  // Double-space → ". " window (mobile muscle memory).
  const lastSpaceTsRef = useRef(0)
  // The on-screen keyboard panel — measured so the parent can size the shell
  // and drive the interactive drag. Absolutely positioned (out of flow), so we
  // read its rendered height with a ResizeObserver and report it up.
  const kbPanelRef = useRef<HTMLDivElement>(null)
  const [hasText, setHasText] = useState(false)
  const [sending, setSending] = useState(false)
  // Bottom panel mode — either the typing keyboard or the sticker picker.
  const [bottomPanel, setBottomPanel] = useState<"keyboard" | "stickers">("keyboard")
  // Quick-reply templates popover.
  // Desktop = wide viewport with a real pointer → use the real OS keyboard, no
  // on-screen VirtualKeyboard. The emoji picker becomes a toggled panel.
  const [desktop, setDesktop] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  // Quick-reply canned messages popover.
  const [qrOpen, setQrOpen] = useState(false)
  // Time picker for a template with a {time} variable: the template being
  // filled, the loaded upcoming slots, and the loading flag. Staff PICK a slot
  // (never type the time) - owner 14.07.
  const [qrPicking, setQrPicking] = useState<QuickReply | null>(null)
  const [slots, setSlots] = useState<{ id: string; date: string; startTime: string }[] | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (pointer: fine)")
    const update = () => setDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  // Recompute the textarea's height (up to 3 lines, then internal scroll).
  // Read-then-write in the same task to avoid layout thrashing. Coalesced
  // through requestAnimationFrame so a burst of keystrokes only triggers
  // one layout pass per frame, not one per character.
  const heightRafRef = useRef<number | null>(null)
  const updateHeightNow = useCallback(() => {
    const t = textareaRef.current
    if (!t) return
    t.style.height = "auto"
    const style = window.getComputedStyle(t)
    const lineHeight = parseFloat(style.lineHeight) || 20
    const paddingTop = parseFloat(style.paddingTop) || 0
    const paddingBottom = parseFloat(style.paddingBottom) || 0
    const borderTop = parseFloat(style.borderTopWidth) || 0
    const borderBottom = parseFloat(style.borderBottomWidth) || 0
    const singleH = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom
    // Empty field → always a single row. Without this, a long placeholder (e.g.
    // the window-closed hint) wraps and inflates scrollHeight on iOS, leaving a
    // tall, stretched, empty box.
    if (!t.value) {
      t.style.height = singleH + "px"
      return
    }
    const maxH = lineHeight * 3 + paddingTop + paddingBottom + borderTop + borderBottom
    const naturalH = t.scrollHeight
    t.style.height = Math.min(naturalH, maxH) + "px"
    if (naturalH > maxH) t.scrollTop = t.scrollHeight
  }, [])
  const updateHeight = useCallback(() => {
    if (heightRafRef.current != null) return
    heightRafRef.current = requestAnimationFrame(() => {
      heightRafRef.current = null
      updateHeightNow()
    })
  }, [updateHeightNow])

  // Recompute height when font scale changes (line-height tracks font-size).
  useLayoutEffect(() => {
    updateHeightNow()
  }, [fontScale, updateHeightNow])

  // Report the caret context to the on-screen keyboard (auto-capitalization).
  // Cheap: a slice + an imperative call; the keyboard only setStates when the
  // shift arming actually flips.
  const syncKbContext = useCallback(() => {
    const t = textareaRef.current
    const kb = kbRef.current
    if (!t || !kb) return
    const pos = t.selectionStart ?? t.value.length
    kb.syncContext(t.value.slice(0, pos))
  }, [])

  // Helper: update hasText flag if the empty/non-empty state actually changed.
  // We deliberately do NOT call setState on every character because hasText
  // would only flip true/false a handful of times — most keystrokes leave the
  // value already non-empty, so this avoids an unnecessary React render.
  const syncHasText = useCallback(() => {
    const t = textareaRef.current
    if (!t) return
    const next = t.value.trim().length > 0
    setHasText((prev) => (prev === next ? prev : next))
  }, [])

  // VirtualKeyboard → insert characters at the current caret position
  // (or replace the current selection). Falls back to "append at end" when
  // the textarea has never been focused (selectionStart is null).
  const insertText = useCallback(
    (ch: string) => {
      const t = textareaRef.current
      if (!t) return
      const value = t.value
      const hasSelection = t.selectionStart !== null && t.selectionEnd !== null
      const start = hasSelection ? (t.selectionStart as number) : value.length
      const end = hasSelection ? (t.selectionEnd as number) : value.length
      // Double-space = ". " (iOS/Android muscle memory): a second quick space
      // right after "word " turns it into "word. ". Only when the previous
      // char is a letter/digit, so ",  " or "  " never becomes "., ".
      if (
        ch === " " &&
        start === end &&
        start >= 2 &&
        Date.now() - lastSpaceTsRef.current < 500 &&
        value[start - 1] === " " &&
        /[\p{L}\p{N}]/u.test(value[start - 2])
      ) {
        t.value = value.slice(0, start - 1) + ". " + value.slice(end)
        const next = start + 1
        try {
          t.setSelectionRange(next, next)
        } catch {}
        lastSpaceTsRef.current = 0
        updateHeight()
        syncHasText()
        syncKbContext()
        return
      }
      lastSpaceTsRef.current = ch === " " ? Date.now() : 0
      t.value = value.slice(0, start) + ch + value.slice(end)
      const next = start + ch.length
      try {
        t.setSelectionRange(next, next)
      } catch {
        // Some browsers throw if the textarea is detached; ignore.
      }
      updateHeight()
      syncHasText()
      syncKbContext()
    },
    [updateHeight, syncHasText, syncKbContext],
  )

  // Quick reply -> send the canned template STRAIGHT to the chat (owner 14.07:
  // "at tap, send it to the chat, not into the input field"). On a closed window
  // the server wraps it in the approved admin_message template. A template with
  // a variable part (needsTime) opens a slot picker first so staff never type
  // the value by hand - see qrPicking.
  const applyQuickReply = useCallback(
    (qr: (typeof QUICK_REPLIES)[number]) => {
      if (qr.needsTime) {
        setQrOpen(false)
        setQrPicking(qr)
        return
      }
      if (sending) return
      setQrOpen(false)
      setSending(true)
      Promise.resolve(onSend(qr.text)).catch(() => {}).finally(() => setSending(false))
    },
    [onSend, sending],
  )

  // Load upcoming class slots when a time-picking template opens. Role-aware:
  // trainers get their own reschedule options, admins the full studio slots.
  // Both return { id, date, startTime, ... } so the picker renders uniformly.
  useEffect(() => {
    if (!qrPicking) return
    let alive = true
    setSlotsLoading(true)
    setSlots(null)
    const today = new Date().toISOString().slice(0, 10)
    const horizon = new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10)
    const url = role === "TRAINER"
      ? "/api/trainer/reschedule-options"
      : `/api/admin/slots?from=${today}&to=${horizon}`
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ id: string; date: string; startTime: string }>) => {
        if (!alive) return
        setSlots(Array.isArray(data) ? data.map((s) => ({ id: s.id, date: s.date, startTime: s.startTime })).slice(0, 50) : [])
      })
      .catch(() => { if (alive) setSlots([]) })
      .finally(() => { if (alive) setSlotsLoading(false) })
    return () => { alive = false }
  }, [qrPicking, role])

  // Send a time-picking template with the chosen slot's time filled in.
  const sendScheduled = useCallback(
    (slot: { date: string; startTime: string }) => {
      if (!qrPicking || sending) return
      let when: string
      try { when = `${format(parseISO(slot.date), "EEE, MMM d")} at ${slot.startTime}` }
      catch { when = slot.startTime }
      const text = qrPicking.text.replace("{time}", when)
      setQrPicking(null)
      setSlots(null)
      setSending(true)
      Promise.resolve(onSend(text)).catch(() => {}).finally(() => setSending(false))
    },
    [qrPicking, onSend, sending],
  )

  // VirtualKeyboard → backspace. If the user has a selection (e.g. they
  // long-pressed and "Select All"), delete the selection wholesale.
  // Otherwise delete the single character before the caret.
  const backspace = useCallback(() => {
    const t = textareaRef.current
    if (!t) return
    const value = t.value
    if (value.length === 0) return
    const hasSelection = t.selectionStart !== null && t.selectionEnd !== null
    const start = hasSelection ? (t.selectionStart as number) : value.length
    const end = hasSelection ? (t.selectionEnd as number) : value.length
    if (start !== end) {
      // Selection mode — drop everything between start and end.
      t.value = value.slice(0, start) + value.slice(end)
      try {
        t.setSelectionRange(start, start)
      } catch {}
    } else if (start > 0) {
      // No selection — delete one character before the caret.
      t.value = value.slice(0, start - 1) + value.slice(start)
      const prev = start - 1
      try {
        t.setSelectionRange(prev, prev)
      } catch {}
    } else {
      // Caret at the very start with nothing selected → nothing to delete.
      return
    }
    updateHeight()
    syncHasText()
    syncKbContext()
  }, [updateHeight, syncHasText, syncKbContext])

  // Send: read value from DOM, clear, call back. Optimistic UI lives in the
  // parent (Inbox.send) — we just hand it the text and reset locally.
  const send = useCallback(async () => {
    const t = textareaRef.current
    if (!t || sending) return
    const draft = t.value.trim()
    if (!draft.length) return
    // Reset the field immediately so it feels instant.
    t.value = ""
    updateHeight()
    setHasText(false)
    syncKbContext() // empty field again → shift re-arms for the next message
    setSending(true)
    try {
      await onSend(draft)
    } catch {
      // onSend manages its own error UI; we just unlock the button.
    } finally {
      setSending(false)
      // Re-focus the textarea so the caret keeps blinking.
      textareaRef.current?.focus({ preventScroll: true })
    }
  }, [onSend, sending, updateHeight, syncKbContext])

  // Initial context report (again when the keyboard re-opens or the panel
  // swaps back from stickers) so the very first letter of a message is
  // capitalized.
  useEffect(() => {
    syncKbContext()
  }, [keyboardOpen, bottomPanel, syncKbContext])

  // Initial focus — desktop only. On mobile the keyboard starts hidden
  // (WhatsApp-style: tap the field to open it), so we don't grab focus on mount.
  useEffect(() => {
    if (desktop) textareaRef.current?.focus()
  }, [desktop])

  // Mobile: mirror the open/closed keyboard state onto the textarea — focus it
  // when the keyboard opens (caret + ready to type), blur it when a thread
  // scroll closes it.
  useEffect(() => {
    if (desktop) return
    const t = textareaRef.current
    if (!t) return
    if (keyboardOpen) t.focus({ preventScroll: true })
    else t.blur()
  }, [keyboardOpen, desktop])

  // Measure the keyboard panel and report its height to the parent (it sizes
  // the shell + drives the interactive drag). Re-measures on rotation / font
  // changes / sticker-vs-keyboard swap via the ResizeObserver.
  useEffect(() => {
    if (desktop) return
    const el = kbPanelRef.current
    if (!el || !onKbHeight) return
    const report = () => onKbHeight(el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [desktop, onKbHeight, bottomPanel])

  return (
    <>
      <div
        className="px-2 pt-2 bg-[#ECE5DD] dark:bg-[#0B141A] relative"
        style={{ paddingBottom: 6 }}
      >
        <div className="flex gap-2 items-end">
          {/* Calendar-x "class action" button: move or cancel this client's
              booking right from the chat (Canggu rollout, 09.07). Muted
              warning tone so it reads "something about the class" without
              screaming. Works regardless of the 24h window - the resulting
              notifications go out as approved templates server-side. */}
          {onClassAction && (
            <button
              type="button"
              tabIndex={-1}
              onClick={onClassAction}
              className="w-9 h-9 mb-0.5 rounded-xl border border-amber-300/80 bg-amber-100/70 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-500/90 flex items-center justify-center flex-shrink-0 active:opacity-60"
              aria-label="Move or cancel a class"
              title="Move or cancel this client's class"
            >
              <CalendarX size={19} />
            </button>
          )}
          {/* Quick replies: canned staff messages. Shown ONLY when the 24h
              window is CLOSED - that's when free text can't reach the client, so
              a pre-approved template is the only way through (a schedule change
              to a client who has gone quiet). When the window is OPEN the staff
              just type, so this icon is hidden (owner 14.07). Tapping a template
              in the popup SENDS it straight to the chat (not into the input) -
              it's wrapped in the approved admin_message template server-side. */}
          {!windowOpen && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setQrOpen((v) => !v)}
              className={cn(
                "w-9 h-9 mb-0.5 rounded-xl border flex items-center justify-center active:opacity-60",
                qrOpen
                  ? "border-brand bg-brand/10 text-brand dark:border-[#69B58F] dark:bg-[#69B58F]/15 dark:text-[#69B58F]"
                  : "border-gray-300/80 bg-white/70 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-[#8696A0]",
              )}
              aria-label="Quick replies"
              title="Quick replies"
            >
              <MessageSquareText size={18} />
            </button>
            {qrOpen && (
              <>
                {/* Tap-away backdrop. */}
                <div className="fixed inset-0 z-40" onClick={() => setQrOpen(false)} />
                <div className="absolute bottom-11 left-0 z-50 w-72 max-w-[86vw] rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#233138] overflow-hidden">
                  {QUICK_REPLIES.map((qr) => (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => applyQuickReply(qr)}
                      className="w-full text-left px-3 py-3 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 border-b border-gray-100 dark:border-white/5 last:border-0"
                    >
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{qr.label}</div>
                      {/* Full content, not truncated - staff sees exactly what
                          will be sent. */}
                      <div className="mt-1 text-xs text-gray-600 dark:text-[#8696A0] whitespace-pre-line leading-relaxed">{qr.text}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          )}
          {/* Time picker for a {time} template: pick an upcoming slot, no manual
              typing. Full-screen sheet so the list is easy to tap. */}
          {qrPicking && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setQrPicking(null)}>
              <div className="absolute inset-0 bg-black/40" />
              <div
                className="relative w-full sm:max-w-sm max-h-[70vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#233138] shadow-xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">Pick the new time</div>
                  <button type="button" onClick={() => setQrPicking(null)} className="p-1.5 -mr-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Close">
                    <span className="text-xl leading-none">×</span>
                  </button>
                </div>
                <div className="px-4 pb-4 overflow-y-auto">
                  {slotsLoading || slots === null ? (
                    <div className="py-8 flex justify-center"><Loader2 size={22} className="animate-spin text-brand" /></div>
                  ) : slots.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-500 dark:text-[#8696A0]">No upcoming classes to pick.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {slots.map((s) => {
                        let label: string
                        try { label = `${format(parseISO(s.date), "EEE, MMM d")} - ${s.startTime}` }
                        catch { label = s.startTime }
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => sendScheduled(s)}
                            className="w-full text-left px-3.5 py-3 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 text-sm text-gray-900 dark:text-white"
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* "+" attachment button — opens the native picker. We deliberately
              fire on `click` (not pointerdown) because the file input dialog
              must be invoked from a user-initiated click for iOS to allow it.

              Shown for BOTH admin and trainer, but ONLY while the 24h window is
              open — free-form media (like free text) can't reach the client
              outside the window, so we swap it for the 👋 wave/template below
              when the window is closed. */}
          {windowOpen && onAttach && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f && onAttach) {
                    void onAttach(f)
                  }
                  // Reset so picking the same file twice still fires onChange.
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => fileInputRef.current?.click()}
                disabled={!onAttach}
                className="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 dark:text-[#8696A0] flex-shrink-0 disabled:opacity-40 active:opacity-60"
                aria-label="Attach photo or video"
              >
                <span className="text-2xl leading-none">+</span>
              </button>
            </>
          )}
          {/* Emoji / sticker toggle — BOTH roles (a trainer softens messages
              with emoji just as much as an admin). Independent of onAttach:
              emoji have nothing to do with file attachments. The icon flips
              depending on which panel is shown below, mirroring WhatsApp. */}
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              if (desktop) {
                setEmojiOpen((v) => !v)
                textareaRef.current?.focus({ preventScroll: true })
              } else {
                // Opening the panel also un-hides the keyboard area on mobile.
                onKeyboardOpenChange?.(true)
                setBottomPanel((m) => (m === "keyboard" ? "stickers" : "keyboard"))
              }
            }}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-60",
              desktop && emojiOpen ? "text-brand dark:text-[#69B58F]" : "text-gray-600 dark:text-[#8696A0]",
            )}
            aria-label="Emoji"
          >
            {/* On desktop the icon is always the smiley (toggles an emoji
                panel); on mobile it flips between emoji + keyboard. */}
            {desktop || bottomPanel === "keyboard" ? <Smile size={22} /> : <Keyboard size={22} />}
          </button>

          {/* Standalone 👋 wave — shown to BOTH admin and trainer, but ONLY
              when the 24h window is CLOSED (a cold chat). It sends an approved
              `wave` template, the one thing that still reaches the client when
              free text/media can't. When the window is open we show the "+"
              attach button instead. Rate-limited to once per 12h. */}
          {!windowOpen && onWave && (
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => { if (!waveDisabled) onWave() }}
              disabled={waveDisabled}
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-2xl leading-none active:opacity-60 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed transition-opacity"
              aria-label="Send a wave"
              title={waveDisabled ? "You can send a wave once every 12 hours" : "Send a wave 👋"}
            >
              👋
            </button>
          )}

          {/* Pill input with the textarea inside. */}
          <div className={cn(
            "flex-1 min-w-0 flex items-end rounded-3xl px-4 py-1 transition-colors",
            // Window open → normal white pill. Window closed → muted grey so
            // it's visually clear free text can't reach the client (only an
            // approved template / wave can).
            windowOpen
              ? "bg-white dark:bg-[#1F2C34] shadow-sm"
              : "bg-gray-200/70 dark:bg-[#202C33]",
          )}>
            <textarea
              ref={textareaRef}
              defaultValue=""
              // Tapping/clicking the input dismisses the emoji/sticker panel
              // so the user can type. We use pointerDown (a real user gesture)
              // rather than focus, which also fires programmatically after each
              // emoji insert — that would close the picker after one pick.
              onPointerDown={() => {
                if (desktop) setEmojiOpen(false)
                else { setBottomPanel("keyboard"); onKeyboardOpenChange?.(true) }
              }}
              onInput={() => {
                updateHeight()
                syncHasText()
                syncKbContext()
              }}
              // Mobile only: the VirtualKeyboard drives input, so we keep the
              // textarea focused (re-grab focus if it's lost to <body>). On
              // desktop the real keyboard is used, so we let blur happen.
              onBlur={desktop ? undefined : () => {
                // Only fight to keep focus while the keyboard is open. When a
                // thread scroll closed it, let the blur stand.
                if (!keyboardOpen) return
                requestAnimationFrame(() => {
                  const active = document.activeElement
                  if (
                    textareaRef.current &&
                    (active === document.body || active === null)
                  ) {
                    textareaRef.current.focus({ preventScroll: true })
                  }
                })
              }}
              // Desktop: Enter sends, Shift+Enter makes a newline.
              onKeyDown={desktop ? (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              } : undefined}
              inputMode={desktop ? undefined : "none"}
              autoCorrect={desktop ? "on" : "off"}
              autoCapitalize={desktop ? "sentences" : "off"}
              spellCheck={desktop}
              placeholder={windowOpen ? "Message" : "Message (sent as a template)"}
              // Staff (admin + trainer) can type even when the 24h window is
              // closed - the server delivers it via the approved admin_message
              // template (free-form can't reach a cold chat, a template can).
              // This is the fix for the "coach sick, must tell today's students"
              // case (owner 2026-07-04) - trainers were stuck with just the wave.
              disabled={sending}
              rows={1}
              className={cn(
                // Bright brand-green caret so it's obvious where the cursor is
                // (the native caret was hard to spot, especially on mobile).
                "flex-1 resize-none overflow-y-auto leading-snug bg-transparent border-0 outline-none focus:outline-none focus:ring-0 py-1.5 caret-brand disabled:text-gray-400 dark:disabled:text-[#5C6970]",
                windowOpen
                  ? "text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#8696A0]"
                  : "text-gray-500 dark:text-[#8696A0] placeholder-gray-400 dark:placeholder-[#5C6970]",
              )}
              style={{ fontSize: `${fontScale * 0.95}rem`, caretColor: "#2C6E49" }}
            />
          </div>

          {/* Send button: fills with brand green the moment there's text to
              send (clear "tap to send" affordance in both themes); stays a
              muted grey circle while empty. */}
          <button
            onClick={send}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            disabled={sending || !hasText}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-colors flex-shrink-0",
              // Active (has text): solid brand green, white icon — same in light + dark.
              "bg-brand text-white shadow-sm enabled:hover:bg-[#225737] enabled:active:bg-brand-dark",
              // Idle (empty): muted, clearly non-actionable.
              "disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-[#2A3942] dark:disabled:text-[#5C6970]",
            )}
            aria-label="Send"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {/* Desktop: no on-screen keyboard — the real keyboard is used. The emoji
          picker is a toggled panel. Mobile: keep the VirtualKeyboard / sticker
          panel always docked at the bottom. */}
      {desktop ? (
        emojiOpen && (
          <StickerPicker
            onPick={(emoji) => {
              insertText(emoji)
              textareaRef.current?.focus({ preventScroll: true })
            }}
          />
        )
      ) : (
        // Mobile: the keyboard/sticker panel is ALWAYS mounted so it can be
        // dragged. Its visible height = var(--kb-h) - var(--kb-off); the parent
        // drives --kb-off (0 = fully open, --kb-h = fully hidden) on tap, scroll
        // and the interactive finger-drag. The panel is absolutely positioned
        // and top-anchored, so its bottom clips as the shell shrinks.
        <div className="kb-shell">
          <div ref={kbPanelRef} className="kb-panel">
            {bottomPanel === "keyboard" ? (
              <VirtualKeyboard ref={kbRef} onInsert={insertText} onBackspace={backspace} inactive={!windowOpen} defaultLang={role === "TRAINER" ? "en" : "ru"} />
            ) : (
              <StickerPicker
                onPick={(emoji) => {
                  // Insert the emoji character at the caret instead of sending
                  // it as a standalone sticker — so users can mix emoji with
                  // text: "Спасибо за бронь 🙏 жду тебя завтра"
                  insertText(emoji)
                  textareaRef.current?.focus({ preventScroll: true })
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
