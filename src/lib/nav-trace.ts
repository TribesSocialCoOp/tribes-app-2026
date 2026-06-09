'use client';

/**
 * Navigation tracer — dev/debug utility.
 *
 * Patches pushState/replaceState and listens for popstate to build a
 * breadcrumb trail of every history mutation. Exposed as window.__navTrace
 * so it can be inspected in the browser console or Chrome remote debugger
 * (useful for Android WebView debugging where you can't see page state).
 *
 * Usage in DevTools console:
 *   window.__navTrace.print()   // pretty-print the trail
 *   window.__navTrace.clear()   // reset
 *   window.__navTrace.entries   // raw array
 */

export type NavEntry = {
  time: string;
  op: 'pushState' | 'replaceState' | 'popstate' | 'goBack' | 'sentinel-guard';
  url: string;
  state: unknown;
  historyLength: number;
};

const MAX_ENTRIES = 50;

function timestamp() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function record(entries: NavEntry[], entry: NavEntry) {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function installNavTrace() {
  if (typeof window === 'undefined') return;
  // Don't install twice
  if ((window as any).__navTrace) return;

  const entries: NavEntry[] = [];

  // Patch pushState
  const origPush = History.prototype.pushState;
  History.prototype.pushState = function (state, title, url) {
    origPush.call(this, state, title, url);
    record(entries, {
      time: timestamp(),
      op: 'pushState',
      url: String(url ?? window.location.href),
      state,
      historyLength: window.history.length,
    });
  };

  // Patch replaceState
  const origReplace = History.prototype.replaceState;
  History.prototype.replaceState = function (state, title, url) {
    origReplace.call(this, state, title, url);
    record(entries, {
      time: timestamp(),
      op: 'replaceState',
      url: String(url ?? window.location.href),
      state,
      historyLength: window.history.length,
    });
  };

  // Listen for popstate (back/forward)
  window.addEventListener('popstate', (e) => {
    const isSentinel = !!(e.state?._tribesSentinel);
    console.log('[nav-trace] popstate → ', window.location.pathname, '| sentinel:', isSentinel, '| histLen:', window.history.length);
    record(entries, {
      time: timestamp(),
      op: 'popstate',
      url: window.location.pathname,
      state: e.state,
      historyLength: window.history.length,
    });
  });

  const api = {
    entries,
    /** Record a goBack call from useGoBack */
    recordGoBack(url: string, state: unknown, length: number) {
      record(entries, { time: timestamp(), op: 'goBack', url, state, historyLength: length });
    },
    recordSentinelGuard(url: string) {
      record(entries, { time: timestamp(), op: 'sentinel-guard', url, state: null, historyLength: window.history.length });
    },
    print() {
      console.table(
        entries.map(e => ({
          time: e.time,
          op: e.op,
          url: e.url,
          sentinel: (e.state as any)?._tribesSentinel ?? false,
          histLen: e.historyLength,
        }))
      );
    },
    clear() {
      entries.length = 0;
    },
  };

  (window as any).__navTrace = api;
}
