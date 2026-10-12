export function isNativeApp() {
  try {
    if (window.Capacitor?.isNativePlatform?.() === true) return true;
  } catch {
    /* sin bridge aún */
  }
  return /CapacitorAndroid|CapacitoriOS/i.test(navigator.userAgent || "");
}
