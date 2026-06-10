"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Keyboard, Loader2, Send, Smile, MessageSquareText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import VirtualKeyboard from "@/app/_components/VirtualKeyboard"
import StickerPicker from "@/app/_components/StickerPicker"

// ---------------------------------------------------------------------------
// Quick reply templates (English). These are Meta-APPROVED WhatsApp message
// templates, so picking one sends it via the template path — which works even
// when the 24h customer-service window is closed (the client hasn't written in
// 24h). The 7 "reschedule to today" variants all map onto the single approved
// `reschedule_today` template via its {{1}} time variable.
// ---------------------------------------------------------------------------
const TEMPLATE_TIMES = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00"]

type TemplateDef = {
  label: string
  /** Human-readable text shown in the popover + stored as the chat bubble. */
  text: string
  /** Approved Meta template name. */
  templateName: string
  /** Positional values for the template's {{1}}, {{2}}, … variables. */
  variables?: string[]
}

// The two fixed quick replies. "Reschedule at <time>" is rendered separately
// as one entry that expands the TEMPLATE_TIMES chips (so the menu isn't
// cluttered with 7 rows), and the 👋 wave is the first entry.
const MESSAGE_TEMPLATES: TemplateDef[] = [
  {
    label: "Today's class — still coming?",
    text: "Hello! 🌿 Just a gentle reminder about your class today — are you still able to join us? We'd love to see you on the mat. 🙏",
    templateName: "class_today_confirm",
  },
  {
    label: "Reschedule to another day",
    text: "Hello! Would it be convenient to reschedule you to another day? Today's group didn't reach more than 2 people.",
    templateName: "reschedule_other_day",
  },
  {
    label: "Booking canceled",
    text: "Done 😊 Your booking has been canceled. We'd love to welcome you back on any day that's convenient for you!",
    templateName: "booking_canceled",
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
}

export default function Composer({ onSend, onAttach, fontScale, role, onSendTemplate, onWave, waveDisabled, windowOpen = true }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hasText, setHasText] = useState(false)
  const [sending, setSending] = useState(false)
  // Bottom panel mode — either the typing keyboard or the sticker picker.
  const [bottomPanel, setBottomPanel] = useState<"keyboard" | "stickers">("keyboard")
  // Quick-reply templates popover.
  const [showTemplates, setShowTemplates] = useState(false)
  // Desktop = wide viewport with a real pointer → use the real OS keyboard, no
  // on-screen VirtualKeyboard. The emoji picker becomes a toggled panel.
  const [desktop, setDesktop] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
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

  // Quick-reply template: drop the chosen text into the input so the admin can
  // review/edit, then close the popover and re-focus the field.
  const applyTemplate = useCallback(
    (text: string) => {
      const t = textareaRef.current
      if (!t) return
      t.value = text
      updateHeight()
      syncHasText()
      setShowTemplates(false)
      try {
        t.setSelectionRange(text.length, text.length)
      } catch {}
      t.focus({ preventScroll: true })
    },
    [updateHeight, syncHasText],
  )

  // Initial focus + keep caret blinking when focus is lost to body.
  useEffect(() => {
    const t = textareaRef.current
    if (!t) return
    t.focus()
  }, [])

  // One quick-reply row. Picking it sends the approved template straight away
  // (works outside the 24h window); falls back to filling the input as free
  // text when no template sender is wired.
  const renderTplButton = (tpl: TemplateDef) => (
    <button
      key={tpl.label}
      type="button"
      onClick={() => {
        if (onSendTemplate) {
          void onSendTemplate({
            templateName: tpl.templateName,
            languageCode: "en",
            variables: tpl.variables,
            display: tpl.text,
          })
          setShowTemplates(false)
        } else {
          applyTemplate(tpl.text)
        }
      }}
      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-[#2A3942] active:bg-gray-100 dark:active:bg-[#33444E] transition-colors"
    >
      <div className="text-xs font-semibold text-[#2C6E49] dark:text-[#69B58F]">{tpl.label}</div>
      <div className="text-sm text-gray-600 dark:text-[#C8D0D4] mt-0.5 line-clamp-2">{tpl.text}</div>
    </button>
  )
  const tplByName = (name: string) => MESSAGE_TEMPLATES.find((t) => t.templateName === name)

  return (
    <>
      <div
        className="px-2 pt-2 bg-[#ECE5DD] dark:bg-[#0B141A] relative"
        style={{ paddingBottom: 6 }}
      >
        {/* Quick-reply templates popover — anchored above the composer row. */}
        {showTemplates && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setShowTemplates(false)}
            />
            <div className="absolute bottom-full left-2 right-2 mb-2 z-40 max-h-72 overflow-y-auto rounded-2xl bg-white dark:bg-[#1F2C34] shadow-xl border border-gray-200 dark:border-[#2A3942] overscroll-contain">
              <div className="sticky top-0 flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#1F2C34] border-b border-gray-100 dark:border-[#2A3942]">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-[#8696A0]">
                  Templates
                </span>
                <button
                  type="button"
                  onClick={() => setShowTemplates(false)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-white"
                  aria-label="Close templates"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="py-1">
                {/* 👋 wave — first entry (admin only; trainers have a standalone
                    👋 button next to this menu). Re-opens a cold chat. */}
                {role === "ADMIN" && onWave && (
                  <button
                    type="button"
                    disabled={waveDisabled}
                    onClick={() => { if (!waveDisabled) { onWave(); setShowTemplates(false) } }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-[#2A3942] active:bg-gray-100 dark:active:bg-[#33444E] transition-colors disabled:opacity-40"
                  >
                    <div className="text-xs font-semibold text-[#2C6E49] dark:text-[#69B58F]">Wave</div>
                    <div className="text-2xl leading-none mt-0.5">👋</div>
                  </button>
                )}

                {/* Fixed order (requested): 1) today's class — still coming,
                    2) reschedule to another day, 3) reschedule at <time>,
                    then booking-canceled last. */}
                {(() => { const t = tplByName("class_today_confirm"); return t ? renderTplButton(t) : null })()}
                {(() => { const t = tplByName("reschedule_other_day"); return t ? renderTplButton(t) : null })()}

                {/* Reschedule at <time> — one entry; tap a time chip to send. */}
                <div className="px-4 py-2.5 border-t border-gray-100 dark:border-[#2A3942]">
                  <div className="text-xs font-semibold text-[#2C6E49] dark:text-[#69B58F]">Reschedule at…</div>
                  <div className="text-sm text-gray-600 dark:text-[#C8D0D4] mt-0.5">Hello! Would it be convenient to reschedule at …?</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TEMPLATE_TIMES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          if (onSendTemplate) {
                            void onSendTemplate({
                              templateName: "reschedule_time",
                              languageCode: "en",
                              variables: [t],
                              display: `Hello! Would it be convenient to reschedule at ${t}?`,
                            })
                            setShowTemplates(false)
                          } else {
                            applyTemplate(`Hello! Would it be convenient to reschedule at ${t}?`)
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#2C6E49]/10 text-[#2C6E49] dark:bg-[#2C6E49]/20 dark:text-[#69B58F] hover:bg-[#2C6E49]/15 touch-manipulation"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => { const t = tplByName("booking_canceled"); return t ? renderTplButton(t) : null })()}
              </div>
            </div>
          </>
        )}
        <div className="flex gap-2 items-end">
          {/* "+" attachment button — opens the native picker. We deliberately
              fire on `click` (not pointerdown) because the file input dialog
              must be invoked from a user-initiated click for iOS to allow it. */}
          {/* Attachment "+" — admin only. Trainers don't need it (and the
              extra button just steals horizontal space from the input). */}
          {role === "ADMIN" && (
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
                    setBottomPanel((m) => (m === "keyboard" ? "stickers" : "keyboard"))
                  }
                }}
                disabled={!onAttach}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:opacity-60",
                  desktop && emojiOpen ? "text-[#2C6E49] dark:text-[#69B58F]" : "text-gray-600 dark:text-[#8696A0]",
                )}
                aria-label="Emoji"
              >
                {/* On desktop the icon is always the smiley (toggles an emoji
                    panel); on mobile it flips between emoji + keyboard. */}
                {desktop || bottomPanel === "keyboard" ? <Smile size={22} /> : <Keyboard size={22} />}
              </button>
            </>
          )}

          {/* Trainer-only standalone 👋 button. Admins send the wave from the
              first entry of the templates menu instead. Rate-limited 12h. */}
          {role === "TRAINER" && onWave && (
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

          {/* Quick-reply templates toggle — available to admin AND trainer. */}
          {onSendTemplate && (
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setShowTemplates((v) => !v)}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-60",
                showTemplates
                  ? "text-[#2C6E49] dark:text-[#69B58F]"
                  : "text-gray-600 dark:text-[#8696A0]",
              )}
              aria-label="Message templates"
            >
              <MessageSquareText size={21} />
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
                else setBottomPanel("keyboard")
              }}
              onInput={() => {
                updateHeight()
                syncHasText()
              }}
              // Mobile only: the VirtualKeyboard drives input, so we keep the
              // textarea focused (re-grab focus if it's lost to <body>). On
              // desktop the real keyboard is used, so we let blur happen.
              onBlur={desktop ? undefined : () => {
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
              placeholder={windowOpen ? "Message" : "Window closed — use a template"}
              // Block typing entirely when the 24h window is closed — free text
              // can't reach the client, so the field is inactive until a client
              // message re-opens the window.
              disabled={sending || !windowOpen}
              rows={1}
              className={cn(
                // Bright brand-green caret so it's obvious where the cursor is
                // (the native caret was hard to spot, especially on mobile).
                "flex-1 resize-none overflow-y-auto leading-snug bg-transparent border-0 outline-none focus:outline-none focus:ring-0 py-1.5 caret-[#2C6E49] disabled:text-gray-400 dark:disabled:text-[#5C6970]",
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
              "bg-[#2C6E49] text-white shadow-sm enabled:hover:bg-[#225737] enabled:active:bg-[#1E4D34]",
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
      ) : bottomPanel === "keyboard" ? (
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
    </>
  )
}
