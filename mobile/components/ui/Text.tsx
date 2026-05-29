import { Text as RNText, type TextProps, type TextStyle } from "react-native"
import { typography } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"

type Variant = "title1" | "title2" | "title3" | "headline" | "body" | "callout" | "subhead" | "footnote" | "caption"
type Tone = "primary" | "secondary" | "muted" | "invert" | "brand" | "danger"

const VARIANT_STYLES: Record<Variant, TextStyle> = {
  title1: { fontSize: typography.size["4xl"], fontWeight: typography.weight.bold, letterSpacing: -0.5 },
  title2: { fontSize: typography.size["3xl"], fontWeight: typography.weight.bold, letterSpacing: -0.4 },
  title3: { fontSize: typography.size["2xl"], fontWeight: typography.weight.semibold, letterSpacing: -0.3 },
  headline: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
  body: { fontSize: typography.size.base, fontWeight: typography.weight.regular },
  callout: { fontSize: typography.size.base, fontWeight: typography.weight.medium },
  subhead: { fontSize: typography.size.sm, fontWeight: typography.weight.regular },
  footnote: { fontSize: typography.size.xs, fontWeight: typography.weight.regular },
  caption: { fontSize: typography.size.xs, fontWeight: typography.weight.regular, textTransform: "uppercase", letterSpacing: 0.5 },
}

// Drop-in Text replacement that maps semantic variant + tone to the right
// theme tokens. Lets screens be near-text-free of inline styling.
export function Text({
  variant = "body",
  tone = "primary",
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const { theme } = useTheme()
  const color =
    tone === "brand" ? theme.brand.primary :
    tone === "danger" ? theme.status.danger :
    tone === "invert" ? theme.text.invert :
    tone === "muted" ? theme.text.muted :
    tone === "secondary" ? theme.text.secondary :
    theme.text.primary

  return <RNText {...rest} style={[VARIANT_STYLES[variant], { color }, style]} />
}
