// Platform-aware shortcut label for in-surface copy (W4: a Windows
// journalist was told to press ⌘K). Header.tsx's own kbd is shared
// chrome — Phase-2. Exported for SpatialMap's hint chip.
export const SEARCH_KBD =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform ?? '')
    ? '⌘K'
    : 'Ctrl+K'
