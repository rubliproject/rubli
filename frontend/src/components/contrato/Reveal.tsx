/**
 * Reveal — sets `data-in` on its element the first time 40% of it is in view
 * (FIX_BRIEF_R1 § D.3); CSS plays the figure's draw off that attribute, once.
 * Never wrap tables or Anexo rows in it.
 */
import { useRef, type HTMLAttributes } from 'react'
import { useInView } from 'framer-motion'

export function Reveal({ children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  return <div ref={ref} data-in={inView ? '' : undefined} {...rest}>{children}</div>
}
