"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { CalendarX, Keyboard, Loader2, MessageSquareText, Send, Smile } from "lucide-react"
import { cn } from "@/lib/utils"
import VirtualKeyboard from "@/app/_components/VirtualKeyboard"
import StickerPicker from "@/app/_components/StickerPicker"

// Canned staff messages ("quick replies"). Picking one drops the text into the
// composer so staff can tweak it (e.g. add the new time) before sending. When
// the 24h customer-service window is CLOSED the send path wraps the text in the
// approved `admin_message` template, so these still reach a client who has gone
// quiet - which is exactly when a schedule change needs to be sent.
const QUICK_REPLIES: { id: string; label: string; text: string }[] = [
  {
    id: "schedule-update",
    label: "Schedule update",
    text: "Greetings!\n\nWe have a small schedule update. Tomorrow's session has been rescheduled to a different time",
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
  /** Called when the user picks a photo/video via the "+" button OR sends a
   *  sticker from the picker. Both go through the same media route. */
  onAttach?: (file: File) => Promise<void> | void
  /** Current font scale for the composer text and 3-line cap calculations. */
  fontScale: number
  /** Which user role is viewing — trainers don't get the photo/video "+"
   *  button (admin-only feature), but they still get the sticker picker. */
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
      t.value = value.slice(0, start) + ch + value.slice(end)
      const next = start + ch.length
      try {
        t.setSelectionRange(next, next)
      } catch {
        // Some browsers throw if the textarea is detached; ignore.
      }
      updateHeight()
      syncHasText()
    },
    [updateHeight, syncHasText],
  )

  // Quick reply → drop the canned text into the composer (replacing any draft),
  // put the caret at the end so staff can keep typing (e.g. the new time), and
  // close the popover. Sending is a separate, deliberate tap.
  const applyQuickReply = useCallback(
    (text: string) => {
      const t = textareaRef.current
      if (t) {
        t.value = text
        try {
          t.setSelectionRange(text.length, text.length)
        } catch {
          // detached textarea — ignore
        }
        updateHeight()
        syncHasText()
        if (desktop) t.focus({ preventScroll: true })
      }
      setQrOpen(false)
    },
    [updateHeight, syncHasText, desktop],
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
  }, [updateHeight, syncHasText])

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
  }, [onSend, sending, updateHeight])

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
          {/* Quick replies: canned staff messages (admin + trainer). Available
              regardless of the 24h window - a closed-window send is auto-wrapped
              in the approved admin_message template server-side, so a schedule
              change still reaches a client who has gone quiet. */}
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
                <div className="absolute bottom-11 left-0 z-50 w-64 max-w-[80vw] rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#233138] overflow-hidden">
                  {QUICK_REPLIES.map((qr) => (
                    <button
                      key={qr.id}
                      type="button"
                      onClick={() => applyQuickReply(qr.text)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 border-b border-gray-100 dark:border-white/5 last:border-0"
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{qr.label}</div>
                      <div className="mt-0.5 text-xs text-gray-500 dark:text-[#8696A0] line-clamp-2 whitespace-pre-line">{qr.text}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
          {/* Admin-only controls: stickers toggle + quick-reply templates.
              Trainers get a single 👋 wave button instead (below). */}
          {role === "ADMIN" && (
            <>
              {/* Sticker / keyboard toggle. The icon flips depending on which
                  panel is currently shown below, mirroring WhatsApp. */}
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
                disabled={!onAttach}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:opacity-60",
                  desktop && emojiOpen ? "text-brand dark:text-[#69B58F]" : "text-gray-600 dark:text-[#8696A0]",
                )}
                aria-label="Emoji"
              >
                {/* On desktop the icon is always the smiley (toggles an emoji
                    panel); on mobile it flips between emoji + keyboard. */}
                {desktop || bottomPanel === "keyboard" ? <Smile size={22} /> : <Keyboard size={22} />}
              </button>
            </>
          )}

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
              <VirtualKeyboard onInsert={insertText} onBackspace={backspace} inactive={!windowOpen} defaultLang={role === "TRAINER" ? "en" : "ru"} />
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
