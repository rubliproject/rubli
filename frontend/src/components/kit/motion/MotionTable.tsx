/** The 2D twin every GPU primitive carries: the same rows, same order. Visible when WebGL is missing or
 *  the reader picks «vista plana»; otherwise visually hidden for screen readers. */
export function MotionTable({ caption, head, rows, visible }: { caption: string; head: string[]; rows: (string | number)[][]; visible: boolean }) {
  return (
    // the hidden twin is clipped by a wrapper: a table ignores width/overflow, so `.mk-sr` on it overflowed the page
    <div className={visible ? 'mk-twin' : 'mk-sr'}>
    <table className="mk-table">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
    </div>
  )
}

export function FlatToggle({ flat, setFlat, lang }: { flat: boolean; setFlat: (f: boolean) => void; lang: 'es' | 'en' }) {
  const en = lang === 'en'
  return (
    <div className="mk-ctl" role="group" aria-label={en ? 'View' : 'Vista'}>
      <button type="button" aria-pressed={!flat} onClick={() => setFlat(false)}>3D</button>
      <button type="button" aria-pressed={flat} onClick={() => setFlat(true)}>{en ? 'flat' : 'plana'}</button>
    </div>
  )
}
