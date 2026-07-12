// Shared "is the embedded web page alive right now?" flag between the (web)
// screen (which owns the WebView and hears the page's web-alive handshake)
// and the root layout (which downloads OTA updates and must decide whether
// applying one immediately would interrupt real work).
//
// current === true  -> the page booted and answered the handshake; the user
//                      may be mid-booking, so an OTA applies later (on
//                      background), never mid-session.
// current === false -> nothing proven alive (cold start, dead renderer,
//                      white screen) - applying an update NOW costs nothing
//                      and is very likely the cure.
export const webAlive = { current: false }
