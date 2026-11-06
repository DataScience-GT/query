// Registers the service worker in production builds, once the page has loaded
// so it never competes with first paint.
const register = () => {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
    // oxlint-disable-next-line no-console
    console.error("[SW] Service worker registration failed:", error);
  });
};

if ("serviceWorker" in navigator) {
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
