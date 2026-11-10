/** A methodology figure on «El Contrato» (DESIGN.md §3, §9): ink rule above, caption below — no box, no cream, no crop marks. */
export function Plate({ caption, children }: { caption?: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="mt-plate">
      {children}
      {caption && <figcaption className="ct-note">{caption}</figcaption>}
    </figure>
  )
}
