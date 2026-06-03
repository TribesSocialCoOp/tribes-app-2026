/** Smoothly scrolls the main app container back to the top. */
export function scrollMainToTop(): void {
  if (typeof window !== 'undefined') {
    document.querySelector('main[data-app-ready]')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
