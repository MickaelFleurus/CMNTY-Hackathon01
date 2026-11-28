// Real fullscreen on phones: the browser's address bar and buttons go away.
//
// Browsers only allow it from a user gesture, so it's requested on the first
// touch in the game. Works on Android (Chrome, Firefox, Samsung Internet).
// iPhone Safari doesn't support fullscreen for web pages; there, "Share → Add
// to Home Screen" opens the game without the address bar instead
// (manifest.webmanifest + the apple-mobile-web-app-capable meta in index.html).
//
// Only in fill mode (CFG.viewport.fill = a phone / tablet); desktop is left alone.
// If the player leaves fullscreen (back gesture), the next touch asks again.

export function enableMobileFullscreen(isPhone) {
  if (!isPhone || typeof document === "undefined") return;
  const el = document.documentElement;
  const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!request) return; // iPhone Safari: use Add to Home Screen

  const goFullscreen = () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      const p = request.call(el, { navigationUI: "hide" });
      p?.catch?.(() => {}); // refused (not a gesture, setting off): just stay windowed
    } catch {
      // older browsers throw instead of rejecting
    }
  };
  addEventListener("touchend", goFullscreen, { passive: true });
  addEventListener("click", goFullscreen);
}
