/** Detect if running inside native Capacitor shell */
export const isNative = typeof window !== 'undefined' &&
  !!(window as any).Capacitor?.isNativePlatform();

export const platform = (() => {
  if (!isNative) return 'web';
  const cap = (window as any).Capacitor;
  return cap?.getPlatform?.() ?? 'web';
})() as 'web' | 'ios' | 'android';
