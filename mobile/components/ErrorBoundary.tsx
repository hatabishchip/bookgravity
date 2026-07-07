import { Component, type ReactNode } from "react"
import { View, Text, Pressable, ScrollView } from "react-native"
import * as Updates from "expo-updates"

// App-wide crash guard. A render error anywhere below (a screen throwing while
// it renders) used to leave a blank WHITE SCREEN with no clue - a trainer hit
// exactly that after login (07.07). This turns any such crash into a readable
// message plus a "Reload" button, and logs the error so it shows up in Metro /
// device logs. It only catches RENDER errors (not async/event handlers), which
// is precisely the class of bug that produced the white screen.

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Surface it in Metro / logcat / Xcode console for diagnosis.
    console.error("[ErrorBoundary] render crash:", error?.message, error?.stack, info?.componentStack)
  }

  reload = () => {
    // Try an OTA-style reload; if that isn't available (dev), just clear the
    // error so React re-renders the tree from scratch.
    Updates.reloadAsync().catch(() => this.setState({ error: null }))
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <View style={{ flex: 1, backgroundColor: "#ffffff", padding: 24, justifyContent: "center" }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
          <Text style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>😕</Text>
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", textAlign: "center", marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 20, lineHeight: 20 }}>
            The app hit an error and couldn&apos;t show this screen. Reload to try again - if it keeps happening, send this text to support.
          </Text>

          <View style={{ backgroundColor: "#F9FAFB", borderColor: "#E5E7EB", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 20 }}>
            <Text style={{ fontSize: 12, color: "#B91C1C", fontFamily: "monospace" }}>
              {error.message || "Unknown error"}
            </Text>
          </View>

          <Pressable
            onPress={this.reload}
            style={{ backgroundColor: "#4f46e5", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Reload the app</Text>
          </Pressable>
          <Pressable onPress={this.reset} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: "#6B7280", fontSize: 14, fontWeight: "500" }}>Try this screen again</Text>
          </Pressable>
        </ScrollView>
      </View>
    )
  }
}
