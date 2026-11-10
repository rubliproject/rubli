// Split out of ConcentrationConstellation.tsx so that file exports only components (react-refresh/only-export-components).
import { SECTOR_COLORS, PATTERN_COLORS } from '@/lib/constants'
import type { ClusterMeta } from './ConcentrationConstellation'

// ── MODE 1: PATRONES (ARIA patterns) ──────────────────────────────────────
// 7 corruption patterns detected by ARIA v1.1. Positions hand-tuned so the
// clusters distribute across the panel without overlap.
export function buildPatternMeta(isEs: boolean): ClusterMeta[] {
  return [
    // 2026-05-22 — second pass on centering. First attempt was perfectly
    // symmetric (P4/P5/P2 all stacked on fx=0.50, vertical bands at fy
    // 0.18/0.30/0.50/0.70/0.82) but the tight 0.12 gaps caused clusters
    // to visually bleed into each other (dot scatter is ±0.085), and the
    // narrow 0.22→0.78 horizontal span left fat margins on both sides.
    //
    // This pass:
    //   • Wider horizontal span: 0.16 → 0.84 (68% of canvas, was 56%)
    //   • Wider vertical span:   0.14 → 0.88 (74% of canvas, was 64%)
    //   • Mean fx = 0.50, mean fy = 0.50 (still centered)
    //   • P4/P2 stagger off the centerline (P4 fx=0.46, P2 fx=0.54) so
    //     they don't stack vertically with P5
    //   • Vertical band gaps: 0.18 / 0.20 / 0.20 / 0.18 — > 2× the dot
    //     scatter, so clusters read as distinct
    // Atlas + Dashboard both consume this helper.
    // P5 — true center, largest cluster (180 T1)
    { code: 'P5', label: isEs ? 'Monto fuera de rango' : 'Amount out of range',   desc: isEs ? 'Montos 2σ sobre el promedio sectorial — 180 proveedores T1' : 'Amounts 2σ above sector average — 180 T1 vendors',           color: PATTERN_COLORS.P5, vendors: 3985,  t1: 180, highRiskPct: 0.62, fx: 0.50, fy: 0.50 },
    // P7 — upper right (56 T1)
    { code: 'P7', label: isEs ? 'Red de contratistas' : 'Contractor Network',        desc: isEs ? 'Redes multi-proveedor con evidencia externa — 56 T1' : 'Multi-vendor networks with external evidence — 56 T1',              color: PATTERN_COLORS.P7, vendors: 257,   t1: 56,  highRiskPct: 0.72, fx: 0.84, fy: 0.32 },
    // P1 — lower right (23 T1)
    { code: 'P1', label: isEs ? 'Peso en su sector' : 'Large share of its sector',      desc: isEs ? 'Proveedor domina >3% del valor sectorial — 23 T1' : 'Vendor dominates >3% of sector value — 23 T1',                 color: PATTERN_COLORS.P1, vendors: 44,    t1: 23,  highRiskPct: 0.85, fx: 0.80, fy: 0.70 },
    // P3 — upper left (26 T1)
    { code: 'P3', label: isEs ? 'Intermediaria de uso único' : 'Single-Use Intermediary', desc: isEs ? 'Ráfaga de contratos + desaparición — 26 T1' : 'Burst of contracts + disappearance — 26 T1',                       color: PATTERN_COLORS.P3, vendors: 2974,  t1: 26,  highRiskPct: 0.44, fx: 0.16, fy: 0.32 },
    // P6 — lower left (31 T1)
    { code: 'P6', label: isEs ? 'Dependencia de un solo comprador' : 'Single-buyer dependence',      desc: isEs ? '>80% contratos de una sola institución — 31 T1' : '>80% of contracts from a single institution — 31 T1',                   color: PATTERN_COLORS.P6, vendors: 15923, t1: 31,  highRiskPct: 0.28, fx: 0.20, fy: 0.70 },
    // P2 — bottom (1 T1), staggered right so it doesn't stack with P5/P4
    { code: 'P2', label: isEs ? 'Proveedor de baja huella (sin RFC)' : 'Low-footprint supplier (no RFC)',           desc: isEs ? 'Sin RFC, ≤10 contratos, desaparece — 1 T1' : 'No RFC, ≤10 contracts, disappears — 1 T1',                        color: PATTERN_COLORS.P2, vendors: 6118,  t1: 1,   highRiskPct: 0.12, fx: 0.54, fy: 0.88 },
    // P4 — top (3 T1), staggered left so it doesn't stack with P5/P2
    { code: 'P4', label: isEs ? 'Patrón de coadjudicación' : 'Co-award pattern',   desc: isEs ? 'Co-licitación >50% + tasa de victoria >70% — 3 T1' : 'Co-bidding >50% + win rate >70% — 3 T1',               color: PATTERN_COLORS.P4, vendors: 220,   t1: 3,   highRiskPct: 0.35, fx: 0.46, fy: 0.14 },
  ]
}

// ── MODE 2: SECTORES (12 sectors in a 4×3 grid) ──────────────────────────
// Grid positions (row, col): 4 columns × 3 rows. Values are fraction of
// FIELD_W × FIELD_H. Attractor radii driven by sqrt(t1) as in PATRONES.
export function buildSectorMeta(isEs: boolean): ClusterMeta[] {
  return [
    // Row 0 (top)
    { code: 'salud',           label: isEs ? 'Salud' : 'Health',           desc: isEs ? 'IMSS, ISSSTE, SSa — mayor concentración de casos documentados' : 'IMSS, ISSSTE, SSa — highest concentration of documented cases',  color: SECTOR_COLORS.salud, vendors: 32000,  t1: 89, highRiskPct: 0.18, fx: 0.15, fy: 0.22 },
    { code: 'educacion',       label: isEs ? 'Educación' : 'Education',       desc: isEs ? 'SEP, SEMS, becas, infraestructura educativa' : 'SEP, SEMS, scholarships, educational infrastructure',                     color: SECTOR_COLORS.educacion, vendors: 28000,  t1: 34, highRiskPct: 0.11, fx: 0.38, fy: 0.22 },
    { code: 'infraestructura', label: isEs ? 'Infraestructura' : 'Infrastructure', desc: isEs ? 'SCT, obra pública — fraude ejecución invisible a este modelo' : 'SCT, public works — execution fraud invisible to this model',   color: SECTOR_COLORS.infraestructura, vendors: 24000,  t1: 67, highRiskPct: 0.14, fx: 0.62, fy: 0.22 },
    { code: 'energia',         label: isEs ? 'Energía' : 'Energy',         desc: isEs ? 'PEMEX, CFE — estructura monopólica, vendedores certificados' : 'PEMEX, CFE — monopolistic structure, certified vendors',    color: SECTOR_COLORS.energia, vendors: 12000,  t1: 44, highRiskPct: 0.16, fx: 0.85, fy: 0.22 },
    // Row 1 (middle)
    { code: 'defensa',         label: isEs ? 'Defensa' : 'Defense',         desc: isEs ? 'SEDENA, SEMAR — datos limitados por seguridad nacional' : 'SEDENA, SEMAR — data limited by national security',          color: SECTOR_COLORS.defensa, vendors: 3400,   t1:  8, highRiskPct: 0.09, fx: 0.15, fy: 0.50 },
    { code: 'tecnologia',      label: isEs ? 'Tecnología' : 'Technology',      desc: isEs ? 'Concentración en servicios TI — riesgo alto en pocos proveedores' : 'IT services concentration — high risk in few vendors', color: SECTOR_COLORS.tecnologia, vendors: 18000,  t1: 29, highRiskPct: 0.13, fx: 0.38, fy: 0.50 },
    { code: 'hacienda',        label: isEs ? 'Hacienda' : 'Treasury',        desc: isEs ? 'SAT, Tesorería — licitaciones amañadas documentadas' : 'SAT, Treasury — documented rigged tenders',             color: SECTOR_COLORS.hacienda, vendors: 9000,   t1: 21, highRiskPct: 0.10, fx: 0.62, fy: 0.50 },
    { code: 'gobernacion',     label: isEs ? 'Gobernación' : 'Interior',     desc: isEs ? 'Estafa Maestra originó aquí — empresas fantasma multi-instituc.' : 'Estafa Maestra originated here — multi-institution ghost companies', color: SECTOR_COLORS.gobernacion, vendors: 15000,  t1: 48, highRiskPct: 0.15, fx: 0.85, fy: 0.50 },
    // Row 2 (bottom)
    { code: 'agricultura',     label: isEs ? 'Agricultura' : 'Agriculture',     desc: isEs ? 'Segalmex, LICONSA — SFP: 2,700 MDP desviados · observaciones ASF 8,636 MDP, no definitivas' : 'Segalmex, LICONSA — SFP: MXN 2.7B diverted · ASF observations MXN 8.6B, not final',                color: SECTOR_COLORS.agricultura, vendors: 7000,   t1: 19, highRiskPct: 0.12, fx: 0.15, fy: 0.78 },
    { code: 'ambiente',        label: isEs ? 'Ambiente' : 'Environment',        desc: isEs ? 'CONAGUA — red rotativa de contratistas fantasma' : 'CONAGUA — rotating network of ghost contractors',                    color: SECTOR_COLORS.ambiente, vendors: 5000,   t1: 11, highRiskPct: 0.08, fx: 0.38, fy: 0.78 },
    { code: 'trabajo',         label: isEs ? 'Trabajo' : 'Labor',         desc: isEs ? 'ISSSTE ambulancias — sobreprecio en arrendamiento' : 'ISSSTE ambulances — overpricing in leasing',               color: SECTOR_COLORS.trabajo, vendors: 4000,   t1: 14, highRiskPct: 0.09, fx: 0.62, fy: 0.78 },
    { code: 'otros',           label: isEs ? 'Otros' : 'Other',           desc: isEs ? 'Miscelánea federal — mayor volumen, menor riesgo promedio' : 'Federal miscellaneous — higher volume, lower average risk',       color: SECTOR_COLORS.otros, vendors: 160000, t1: 35, highRiskPct: 0.07, fx: 0.85, fy: 0.78 },
  ]
}

// ── MODE 3: SEXENIOS (6 presidential periods as timeline) ────────────────
// Arranged chronologically left-to-right, Y centered at 0.50. AMLO cluster
// is visibly larger (more vendors, higher risk) — crimson.
export function buildSexenioMeta(isEs: boolean): ClusterMeta[] {
  return [
    { code: 'zedillo',   label: 'Zedillo',    desc: isEs ? 'Datos pre-COMPRANET muy limitados (cobertura estructura A)' : 'Pre-COMPRANET data very limited (structure A coverage)',                 color: SECTOR_COLORS.otros, vendors: 15000,  t1:  6, highRiskPct: 0.06, fx: 0.08, fy: 0.50, kicker: '1994–2000' },
    { code: 'fox',       label: 'Fox',        desc: isEs ? 'Primera alternancia — datos estructura A, RFC <1%' : 'First political transition — structure A data, RFC <1%',                          color: SECTOR_COLORS.hacienda, vendors: 25000,  t1: 12, highRiskPct: 0.07, fx: 0.22, fy: 0.50, kicker: '2000–2006' },
    { code: 'calderon',  label: 'Calderón',   desc: isEs ? 'Guerra contra el narco — contratos SEDENA/SEMAR escalan' : 'Drug war — SEDENA/SEMAR contracts escalate',                       color: SECTOR_COLORS.educacion, vendors: 40000,  t1: 24, highRiskPct: 0.08, fx: 0.38, fy: 0.50, kicker: '2006–2012' },
    { code: 'pena',      label: 'Peña Nieto', desc: isEs ? 'Estafa Maestra, Odebrecht, Casa Blanca — casos documentados del sexenio' : 'Estafa Maestra, Odebrecht, Casa Blanca — the term\'s documented cases',    color: SECTOR_COLORS.infraestructura, vendors: 65000,  t1: 58, highRiskPct: 0.12, fx: 0.55, fy: 0.50, kicker: '2012–2018' },
    { code: 'amlo',      label: 'AMLO',       desc: isEs ? 'Segalmex, Tren Maya, COVID — mayor volumen y mayor concentración T1' : 'Segalmex, Tren Maya, COVID — higher volume and higher T1 concentration',        color: SECTOR_COLORS.salud, vendors: 120000, t1: 148, highRiskPct: 0.18, fx: 0.72, fy: 0.50, kicker: '2018–2024' },
    { code: 'sheinbaum', label: 'Sheinbaum',  desc: isEs ? 'Año 1 — señales tempranas de continuidad en adjudicaciones directas' : 'Year 1 — early signs of continuity in direct awards',        color: SECTOR_COLORS.gobernacion, vendors: 28000,  t1: 72, highRiskPct: 0.15, fx: 0.90, fy: 0.50, kicker: '2024–' },
  ]
}
