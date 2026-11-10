import sqlite3
c = sqlite3.connect('D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db')
c.execute('PRAGMA busy_timeout=60000')
cur = c.cursor()
CATCHALL = (88, 89, 90, 91, 92)

# CUCOP 3-digit generica names (Clasificador por Objeto del Gasto, SHCP)
GEN = {
 '211': 'Materiales/utiles de oficina', '212': 'Mat. impresion/reproduccion', '214': 'Mat./utiles TI (consumibles)',
 '215': 'Mat. impreso/informacion', '216': 'Material de limpieza', '221': 'Productos alimenticios (personas)',
 '223': 'Utensilios/alimentos', '232': 'Insumos textiles', '233': 'Productos de papel/carton',
 '235': 'Productos quimicos/farmaceuticos', '237': 'Productos de cuero/piel/hule', '238': 'Mercancias p/comercializacion',
 '246': 'Material electrico/electronico', '248': 'Materiales complementarios', '249': 'Otros mat./art. construccion',
 '251': 'Productos quimicos basicos', '253': 'Medicinas/productos farmaceuticos', '254': 'Mat./accesorios/suministros medicos',
 '255': 'Mat./accesorios laboratorio', '259': 'Otros productos quimicos', '261': 'Combustibles/lubricantes/aditivos',
 '271': 'Vestuario y uniformes', '295': 'Refacciones/accesorios menores eq.', '296': 'Refacciones equipo transporte',
 '298': 'Refacc./accesorios maquinaria',
 '319': 'Servicios integrales/otros (basicos)', '323': 'Arrend. mobiliario/equipo admin', '325': 'Arrend. equipo transporte',
 '327': 'Arrend. activos intangibles/software', '331': 'Servicios legales/contables/asesoria', '333': 'Serv. consultoria admin/informatica',
 '334': 'Capacitacion', '335': 'Serv. investigacion cientifica', '336': 'Serv. apoyo admin/fotocopiado/impresion',
 '338': 'Serv. vigilancia/seguridad', '339': 'Servicios profesionales/integrales (otros)', '345': 'Seguros de bienes',
 '347': 'Fletes y maniobras', '351': 'Mant. inmuebles', '352': 'Mant. mobiliario/equipo admin',
 '353': 'Mant. bienes informaticos', '354': 'Mant. equipo/instrumental medico', '355': 'Mant. equipo de transporte',
 '357': 'Mant. maquinaria/otros equipos', '358': 'Servicios de limpieza/jardineria', '359': 'Serv. jardineria/fumigacion',
 '361': 'Difusion/mensajes program. gob.', '362': 'Difusion comercial/publicidad',
 '441': 'Ayudas sociales a personas',
 '511': 'Mobiliario', '515': 'Equipo de computo/TIC', '531': 'Equipo medico y de laboratorio',
 '154': 'Prestaciones de seguridad social',
 '613': 'Obra: division terrenos/urbanizacion', '622': 'Obra: edificacion no habitacional', '623': 'Obra: construccion p/abasto agua',
 '624': 'Obra: division terrenos/construccion', '625': 'Obra: construccion vias comunicacion', '626': 'Obra: otras construcciones ing. civil',
 '629': 'Obra: trabajos acabados/instalaciones',
}

CAP_CLASS = {'1': 'PERSONNEL', '2': 'GOODS', '3': 'SERVICES', '4': 'TRANSFERS', '5': 'CAPITAL', '6': 'WORKS', '7': 'FINANCIAL', '8': 'TRANSFERS'}

CAT_NATURE = {
 1: 'GOODS', 2: 'GOODS', 3: 'GOODS', 4: 'CAPITAL', 5: 'GOODS',
 6: 'SERVICES', 7: 'GOODS', 8: 'CAPITAL',
 9: 'WORKS', 10: 'WORKS', 11: 'WORKS', 12: 'SERVICES',
 13: 'GOODS', 14: 'GOODS', 15: 'GOODS', 16: 'SERVICES', 17: 'SERVICES', 18: 'SERVICES', 19: 'CAPITAL',
 20: 'GOODS', 21: 'CAPITAL', 22: 'GOODS', 23: 'GOODS', 24: 'SERVICES', 25: 'GOODS',
 26: 'WORKS', 27: 'WORKS', 28: 'WORKS', 29: 'WORKS', 30: 'SERVICES',
 31: 'GOODS', 32: 'CAPITAL', 33: 'SERVICES', 34: 'SERVICES',
 37: 'GOODS', 38: 'SERVICES', 39: 'SERVICES', 40: 'SERVICES',
 41: 'CAPITAL', 42: 'SERVICES', 43: 'SERVICES', 44: 'SERVICES',
 45: 'GOODS', 46: 'CAPITAL', 47: 'SERVICES', 48: 'GOODS',
 49: 'SERVICES', 50: 'SERVICES', 51: 'SERVICES', 52: 'SERVICES', 53: 'SERVICES', 54: 'SERVICES', 55: 'SERVICES', 56: 'SERVICES',
 57: 'GOODS', 58: 'SERVICES', 59: 'GOODS',
 60: 'SERVICES', 61: 'CAPITAL', 62: 'GOODS',
 63: 'SERVICES', 64: 'GOODS', 65: 'SERVICES',
 66: 'SERVICES', 67: 'SERVICES', 68: 'SERVICES',
 69: 'SERVICES', 70: 'SERVICES', 71: 'TRANSFERS',
 72: 'SERVICES', 73: 'SERVICES', 74: 'SERVICES',
 75: 'GOODS', 76: 'GOODS',
 77: 'SERVICES', 78: 'SERVICES',
 79: 'GOODS', 80: 'GOODS', 81: 'GOODS',
 82: 'GOODS', 83: 'SERVICES', 84: 'CAPITAL', 85: 'GOODS', 86: 'CAPITAL', 87: 'CAPITAL',
 93: 'GOODS',
}

CATNAME = {}
cur.execute('SELECT id,name_en FROM categories')
for cid, nm in cur.fetchall():
    CATNAME[cid] = nm

print('=' * 70)
print('Q2: CUCOP-capitulo vs regex-category-nature AGREEMENT')
print('=' * 70)
cur.execute("""
SELECT category_id, SUBSTR(TRIM(partida_especifica),1,1) cap, COUNT(*), COALESCE(SUM(amount_mxn),0)
FROM contracts
WHERE partida_especifica IS NOT NULL AND TRIM(partida_especifica)<>''
  AND category_id IS NOT NULL AND category_id NOT IN (88,89,90,91,92)
GROUP BY category_id, cap
""")
agree = disagree = ambig = 0
av = dv = avv = 0.0
gross = {}
for cid, cap, n, v in cur.fetchall():
    cn = CAT_NATURE.get(cid)
    cc = CAP_CLASS.get(cap)
    if cn is None or cc is None:
        ambig += n
        avv += v
        continue
    if cn == cc:
        agree += n
        av += v
    else:
        disagree += n
        dv += v
        prev = gross.get((cn, cc), (0, 0.0))
        gross[(cn, cc)] = (prev[0] + n, prev[1] + v)
tot = agree + disagree
print('comparable contracts: %d' % (tot))
print('AGREE   : %7d (%.2f%%) | %.3e MXN' % (agree, 100.0 * agree / tot, av))
print('DISAGREE: %7d (%.2f%%) | %.3e MXN' % (disagree, 100.0 * disagree / tot, dv))
print('ambiguous(excluded): %d | %.3e MXN' % (ambig, avv))
print('--- Top gross disagreements (regex_nature -> cucop_class) ---')
for k, (n, v) in sorted(gross.items(), key=lambda x: -x[1][0])[:14]:
    print('  regex=%-9s CUCOP=%-9s : %6d | %.3e MXN' % (k[0], k[1], n, v))

print()
print('=' * 70)
print('Q3: TOP 30 3-DIGIT GENERICA by count; splinter analysis')
print('=' * 70)
cur.execute("""
SELECT SUBSTR(TRIM(partida_especifica),1,3) g, COUNT(*) n, COALESCE(SUM(amount_mxn),0) v
FROM contracts
WHERE partida_especifica IS NOT NULL AND TRIM(partida_especifica)<>''
GROUP BY g ORDER BY n DESC LIMIT 30
""")
top_g = cur.fetchall()
print('%-5s %-38s %8s %12s %6s %s' % ('gen', 'CUCOP meaning', 'count', 'value_MXN', 'distCat', 'top_regex_cat (share)'))
splinter_rows = []
clean_rows = []
for g, n, v in top_g:
    # distinct regex categories for this generica + top one
    cur.execute("""
    SELECT category_id, COUNT(*) cc FROM contracts
    WHERE SUBSTR(TRIM(partida_especifica),1,3)=? AND partida_especifica IS NOT NULL
    GROUP BY category_id ORDER BY cc DESC
    """, (g,))
    rows = cur.fetchall()
    distinct_cats = len(rows)
    topcat, topn = rows[0]
    share = 100.0 * topn / n
    tcname = CATNAME.get(topcat, 'NULL')
    gname = GEN.get(g, '?')
    print('%-5s %-38s %8d %12.2e %6d  cat%s %s (%.0f%%)' % (g, gname[:38], n, v, distinct_cats, topcat, tcname[:24], share))
    if distinct_cats >= 15 or share < 50:
        splinter_rows.append((g, gname, n, distinct_cats, topcat, tcname, share))
    if share >= 75 and distinct_cats <= 8:
        clean_rows.append((g, gname, n, distinct_cats, topcat, tcname, share))

print()
print('--- SPLINTERED generica (>=15 distinct regex cats OR top share <50%) = regex is NOISY ---')
for g, gn, n, dc, tc, tcn, sh in splinter_rows:
    print('  %s %-36s n=%6d distinctCats=%3d topShare=%.0f%% (top=cat%s %s)' % (g, gn[:36], n, dc, sh, tc, tcn[:20]))

print()
print('--- CLEAN generica (top share >=75%, <=8 cats) = CUCOP is a reliable key ---')
for g, gn, n, dc, tc, tcn, sh in clean_rows:
    print('  %s %-36s n=%6d distinctCats=%3d topShare=%.0f%% (top=cat%s %s)' % (g, gn[:36], n, dc, sh, tc, tcn[:20]))

print()
print('=' * 70)
print('Q4: MULTI-PARTIDA (comma) consolidated purchases')
print('=' * 70)
cur.execute("SELECT COUNT(*), COALESCE(SUM(amount_mxn),0) FROM contracts WHERE partida_especifica LIKE '%,%'")
mc, mv = cur.fetchone()
print('multi-partida total: %d contracts | %.3e MXN' % (mc, mv))
cur.execute("""
SELECT COUNT(*), COALESCE(SUM(amount_mxn),0) FROM contracts
WHERE partida_especifica LIKE '%,%' AND category_id IN (88,89,90,91,92)
""")
mcc, mcv = cur.fetchone()
print('multi-partida in catch-all: %d (%.1f%%) | %.3e MXN' % (mcc, 100.0 * mcc / mc, mcv))
print('--- multi-partida by regex category (top 12) ---')
cur.execute("""
SELECT category_id, COUNT(*) n, COALESCE(SUM(amount_mxn),0) v FROM contracts
WHERE partida_especifica LIKE '%,%'
GROUP BY category_id ORDER BY n DESC LIMIT 12
""")
for cid, n, v in cur.fetchall():
    print('  cat%-3s %-26s : %6d | %.3e MXN' % (cid, CATNAME.get(cid, '?')[:26], n, v))
# cross-capitulo multi (e.g. goods+services mixed) - sample distinct mixes
print('--- multi-partida cross-capitulo: do consolidated buys mix goods+services+works? ---')
cur.execute("""
SELECT partida_especifica FROM contracts WHERE partida_especifica LIKE '%,%' LIMIT 200000
""")
mixcount = {'same': 0, 'mixed': 0}
for (p,) in cur.fetchall():
    caps = set(x.strip()[0] for x in p.split(',') if x.strip())
    if len(caps) > 1:
        mixcount['mixed'] += 1
    else:
        mixcount['same'] += 1
tot_mix = mixcount['same'] + mixcount['mixed']
print('  of %d sampled multi-partida: same-capitulo=%d (%.1f%%) mixed-capitulo=%d (%.1f%%)' % (
    tot_mix, mixcount['same'], 100.0 * mixcount['same'] / tot_mix, mixcount['mixed'], 100.0 * mixcount['mixed'] / tot_mix))
