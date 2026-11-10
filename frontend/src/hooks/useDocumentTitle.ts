import { useLayoutEffect } from 'react'

// = DEFAULT_META.es.title in lib/seo/routeMeta.ts and the index.html <title>.
const SITE_TITLE = 'RUBLI · Contratación pública federal de México'

// Mounted hook instances per title. MainLayout's `AnimatePresence popLayout`
// wraps an <Outlet/>, so the leaving page re-renders as the NEW route and
// unmounts after the entering page set its title — two instances can hold
// the same title at once.
const holders = new Map<string, number>()

const setMeta = (selector: string, value: string) => document.head.querySelector(selector)?.setAttribute('content', value)

/**
 * Set `document.title` while the page is mounted. On unmount it restores the
 * site title only if the title is still this one and no other mounted
 * instance holds it; it never restores the previous title.
 *
 * Also the share card: og:/twitter:title (`shareTitle` when given, else the
 * tab title), and the description when one is given. MainLayout's RouteMeta resets them on the next route (its layout
 * effect runs before the page's). Browsers and JS-running crawlers only:
 * social scrapers read the static index.html head (launch re-audit S7).
 */
export function useDocumentTitle(title: string | null | undefined, description?: string | null, shareTitle?: string | null) {
  useLayoutEffect(() => {
    if (!description) return
    for (const s of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) setMeta(s, description)
  }, [description])
  useLayoutEffect(() => {
    if (!title) return
    document.title = title
    setMeta('meta[property="og:title"]', shareTitle || title)
    setMeta('meta[name="twitter:title"]', shareTitle || title)
    holders.set(title, (holders.get(title) ?? 0) + 1)
    return () => {
      const n = (holders.get(title) ?? 1) - 1
      if (n > 0) holders.set(title, n)
      else holders.delete(title)
      if (n <= 0 && document.title === title) document.title = SITE_TITLE
    }
  }, [title, shareTitle])
}
