// Progressive-enhancement haptics for that "it vibrates when you touch it" feel.
// navigator.vibrate fires on Android/Chrome; iOS Safari ignores it (real iOS
// haptics come later). No-op and safe everywhere else.
export function haptic(pattern: number | number[] = 8): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}
