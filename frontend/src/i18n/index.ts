import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

const BOT_UA = /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|embedly|lighthouse/i
const detector = new LanguageDetector()
// Crawlers and link-preview fetchers index/preview in Spanish (the site's language), whatever their locale.
detector.addDetector({ name: 'crawler', lookup: () => (BOT_UA.test(navigator.userAgent) ? 'es' : undefined) })

import type { BackendModule, ReadCallback } from 'i18next'

// The shell's two namespaces ship in the entry chunk; every other namespace is
// its own chunk, fetched the first time a component asks for it
// (useTranslation suspends into the route's boundary meanwhile).
import esCommon from './locales/es/common.json'
import enCommon from './locales/en/common.json'
import esNav from './locales/es/nav.json'
import enNav from './locales/en/nav.json'

const lazyNs = import.meta.glob<{ default: Record<string, unknown> }>([
  './locales/*/*.json', '!./locales/*/common.json', '!./locales/*/nav.json',
])

const chunkBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(lng: string, ns: string, cb: ReadCallback) {
    const load = lazyNs[`./locales/${lng}/${ns}.json`]
    if (!load) return cb(null, {})
    load().then((m) => cb(null, m.default), (err: Error) => cb(err, null))
  },
}

i18n
  .use(chunkBackend)
  .use(detector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { common: esCommon, nav: esNav },
      en: { common: enCommon, nav: enNav },
    },
    // Bundled common/nav + the chunk backend for the rest.
    partialBundledLanguages: true,
    ns: ['common', 'nav'],
    // Init stays synchronous (common/nav are in hand), so the first render and
    // the <html lang> line below see a ready instance.
    initAsync: false,
    // Do NOT set lng here — let LanguageDetector determine the language from
    // localStorage. An explicit lng option overrides the detector and would
    // prevent the detector from ever running, so new users always got 'en'
    // regardless of any stored preference. The fallbackLng below handles the
    // case where no language is detected.
    fallbackLng: 'en',
    // A stored choice wins; with none, an es-* browser lands in Spanish (D47).
    // supportedLngs folds 'es-MX' → 'es' and 'en-US'/'fr' → 'en', so code that
    // compares i18n.language with 'en'/'es' never sees a regional code.
    supportedLngs: ['en', 'es'],
    // ?lng= first (shareable English/Spanish links), then a stored choice; crawlers get Spanish —
    // the document is lang="es" and Googlebot reports en-US (SEO audit 2026-10-26); people keep D47.
    detection: { order: ['querystring', 'crawler', 'localStorage', 'navigator'], lookupQuerystring: 'lng', caches: ['localStorage'] },
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  })

// Sync <html lang="..."> with the active language so screen readers + browser
// spell-check pick up the correct language immediately.
//
// IMPORTANT: common/nav are bundled and initAsync is off, so i18n.init() above
// resolves SYNCHRONOUSLY — the 'initialized' event fires *inside* init(),
// before the listener below can attach. On a first load in a detected
// non-default language (e.g. a returning ES visitor, or a shared ES deep
// link) <html lang> therefore stayed at the index.html default 'en' while the
// whole UI rendered Spanish (paw-patrol LOW finding, 2026-06-04). The direct
// assignment here covers that synchronous case; the listeners cover the async
// path and runtime language toggles.
if (i18n.language) document.documentElement.lang = i18n.language
i18n.on('initialized', () => {
  document.documentElement.lang = i18n.language
})
i18n.on('languageChanged', (lng: string) => {
  document.documentElement.lang = lng
})

export default i18n
