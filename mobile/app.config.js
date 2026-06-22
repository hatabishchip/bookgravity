// Dynamic config layered on top of app.json.
//
// Default (production): keeps the real identifiers from app.json
//   ios.bundleIdentifier / android.package = com.bookgravity.gravitystretching
//   -> published to the stores under PT Gravity Stretching Canggu.
//
// Test variant (APP_VARIANT=test, set on the EAS "preview" profile): uses a
// dedicated iOS bundle id so the TestFlight build under the temporary Apple
// team (A5837FW3PP, Education) does NOT lock the production bundle id, which
// stays reserved for the PT account. Android keeps the same package (the test
// APK is sideloaded, no store conflict).
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT === "test") {
    config.name = "Gravity Stretching (Test)"
    config.ios = {
      ...config.ios,
      bundleIdentifier: "com.bookgravity.gravitystretching.test",
    }
  }
  return config
}
