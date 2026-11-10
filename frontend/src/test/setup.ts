import '@testing-library/jest-dom'
import i18n from '../i18n'

// Production fetches non-shell namespaces lazily; tests get them all up front so
// renders stay synchronous.
for (const [path, bundle] of Object.entries(import.meta.glob<Record<string, unknown>>('../i18n/locales/*/*.json', { eager: true, import: 'default' }))) {
  const [, lng, ns] = path.match(/locales\/(\w+)\/(\w+)\.json$/)!
  i18n.addResourceBundle(lng, ns, bundle, true, true)
}

// Mock matchMedia for components that use media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root = null
  rootMargin = ''
  thresholds = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
} as unknown as typeof IntersectionObserver

// jsdom ships no canvas: its getContext is a "Not implemented" stub that logs a
// jsdom error. Declare the absence explicitly — callers (lib/plateLabels) take
// their no-context fallback path.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
