// Split out of figureChrome.tsx so that file exports only components (react-refresh/only-export-components).

export const pct2 = (v: number) => `${v.toFixed(2)}%`

export const pct1 = (v: number) => `${v.toFixed(1)}%`

export const pp = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} pp`
