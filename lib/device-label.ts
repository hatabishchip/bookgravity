// Turn a raw User-Agent string into a short, human-friendly device label like
// "Chrome · macOS" or "Safari · iPhone" for the admin "who's signed in" view.
// Deliberately tiny — no dependency, just enough to be recognisable.
export function deviceLabelFromUA(ua: string | null | undefined): string {
  if (!ua) return "Unknown device"

  // OS / device
  let os = "Unknown"
  if (/iPhone/i.test(ua)) os = "iPhone"
  else if (/iPad/i.test(ua)) os = "iPad"
  else if (/Android/i.test(ua)) os = "Android"
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS"
  else if (/Windows/i.test(ua)) os = "Windows"
  else if (/Linux/i.test(ua)) os = "Linux"

  // Browser (order matters: Edge/Chrome both contain "Chrome", etc.)
  let browser = "Browser"
  if (/Edg\//i.test(ua)) browser = "Edge"
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera"
  else if (/Firefox\//i.test(ua)) browser = "Firefox"
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome"
  else if (/CriOS\//i.test(ua)) browser = "Chrome"
  else if (/Safari\//i.test(ua)) browser = "Safari"

  return `${browser} · ${os}`
}
