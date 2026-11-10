"""
cucop_catalog.py — Mexican federal CUCOP (Clasificador por Objeto del Gasto) reference.

The `partida_especifica` field carried on COMPRANET structure-D contracts (2023-2025,
~98% coverage) is the government's own object-of-expenditure code. This module turns the
5-digit code into:
  - capitulo  (1-7): the spending chapter            -> first digit
  - spending_class:  Goods / Services / Works / ...   -> derived from capitulo
  - generica name (Spanish, official-style label)     -> first 3 digits
  - category_id:     our 72-category taxonomy target  -> curated map below

CUCOP is Mexico's official COG; its capitulo axis maps cleanly onto the
goods / services / works trichotomy used by the World Bank & OECD procurement-integrity
frameworks (capitulo 2 = goods, 3 = services, 6 = works/obra publica).

GENERICA_MAP below covers every 3-digit generica actually present in the corpus
(182 distinct, verified 2026-06-09). Genericas that are genuinely broad
(319, 339, 357, 391, 396, 399, the 4xxx transfers) are deliberately mapped to a
catch-all category — overriding them would be mislabeling, not classifying.

Pure data module: no DB access, importable from migration/precompute scripts.
"""

# ── Capitulo (first digit) → (name_es, spending_class_en) ─────────────────────
CAPITULO = {
    1: ("Servicios Personales", "Personnel"),
    2: ("Materiales y Suministros", "Goods"),
    3: ("Servicios Generales", "Services"),
    4: ("Transferencias, Asignaciones, Subsidios y Otras Ayudas", "Transfers"),
    5: ("Bienes Muebles, Inmuebles e Intangibles", "Capital"),
    6: ("Inversión Pública", "Works"),
    7: ("Inversiones Financieras y Otras Provisiones", "Financial"),
    8: ("Otros", "Other"),
    9: ("Otros", "Other"),
}

# Catch-all (junk-drawer) categories — a generica mapping here is honest, not a "rescue".
CATCH_ALL_CATEGORIES = {88, 89, 90, 91, 92}

# ── Generica (first 3 digits of the specifica) → (name_es, category_id) ───────
# category_id refers to the active 72-category taxonomy in classify_categories.py.
GENERICA_MAP = {
    # ── Capitulo 1 — Servicios Personales (payroll; rare/anomalous in procurement) ──
    "122": ("Sueldos base al personal eventual", 91),
    "141": ("Aportaciones de seguridad social", 71),
    "144": ("Aportaciones para seguros", 71),
    "154": ("Prestaciones contractuales", 71),
    "155": ("Apoyos a la capacitación de los servidores públicos", 54),
    "159": ("Otras prestaciones sociales y económicas", 71),
    "171": ("Estímulos", 71),

    # ── Capitulo 2 — Materiales y Suministros (GOODS) ──
    "211": ("Materiales, útiles y equipos menores de oficina", 45),
    "212": ("Materiales y útiles de impresión y reproducción", 47),
    "213": ("Material estadístico y geográfico", 45),
    "214": ("Materiales, útiles y equipos menores de tecnologías de la información", 45),
    "215": ("Material impreso e información digital", 47),
    "216": ("Material de limpieza", 64),
    "217": ("Materiales y útiles de enseñanza", 82),
    "218": ("Materiales para el registro e identificación de bienes y personas", 48),
    "221": ("Productos alimenticios para personas", 57),
    "222": ("Productos alimenticios para animales", 85),
    "223": ("Utensilios para el servicio de alimentación", 58),
    "231": ("Productos alimenticios, agropecuarios y forestales (materia prima)", 85),
    "232": ("Insumos textiles adquiridos como materia prima", 76),
    "233": ("Productos de papel, cartón e impresos (materia prima)", 47),
    "234": ("Combustibles, lubricantes, aditivos, carbón (materia prima)", 37),
    "235": ("Productos químicos, farmacéuticos y de laboratorio (materia prima)", 93),
    "236": ("Productos metálicos y a base de minerales (materia prima)", 90),
    "237": ("Productos de cuero, piel, plástico y hule (materia prima)", 90),
    "238": ("Mercancías adquiridas para su comercialización", 57),
    "239": ("Otros productos adquiridos como materia prima", 90),
    "241": ("Productos minerales no metálicos", 90),
    "242": ("Cemento y productos de concreto", 90),
    "243": ("Cal, yeso y productos de yeso", 90),
    "244": ("Madera y productos de madera", 90),
    "245": ("Vidrio y productos de vidrio", 90),
    "246": ("Material eléctrico y electrónico", 79),
    "247": ("Artículos metálicos para la construcción", 90),
    "248": ("Materiales complementarios", 90),
    "249": ("Otros materiales y artículos de construcción y reparación", 90),
    "251": ("Productos químicos básicos", 93),
    "252": ("Fertilizantes, pesticidas y otros agroquímicos", 85),
    "253": ("Medicinas y productos farmacéuticos", 20),
    "254": ("Materiales, accesorios y suministros médicos", 22),
    "255": ("Materiales, accesorios y suministros de laboratorio", 23),
    "256": ("Fibras sintéticas, hules, plásticos y derivados", 90),
    "259": ("Otros productos químicos", 93),
    "261": ("Combustibles, lubricantes y aditivos", 37),
    "271": ("Vestuario y uniformes", 75),
    "272": ("Prendas de seguridad y protección personal", 75),
    "273": ("Artículos deportivos", 83),
    "274": ("Productos textiles", 76),
    "275": ("Blancos y otros productos textiles, excepto prendas de vestir", 76),
    "281": ("Sustancias y materiales explosivos", 62),
    "282": ("Materiales de seguridad pública", 62),
    "283": ("Prendas de protección para seguridad pública y nacional", 62),
    "291": ("Herramientas menores", 81),
    "292": ("Refacciones y accesorios menores de edificios", 81),
    "293": ("Refacciones y accesorios menores de mobiliario y equipo de administración", 81),
    "294": ("Refacciones y accesorios menores de equipo de cómputo", 32),
    "295": ("Refacciones y accesorios menores de equipo e instrumental médico", 21),
    "296": ("Refacciones y accesorios menores de equipo de transporte", 44),
    "297": ("Refacciones y accesorios menores de equipo de defensa y seguridad", 62),
    "298": ("Refacciones y accesorios menores de maquinaria y otros equipos", 86),
    "299": ("Refacciones y accesorios menores otros bienes muebles", 90),

    # ── Capitulo 3 — Servicios Generales (SERVICES) ──
    "311": ("Energía eléctrica", 38),
    "312": ("Gas", 37),
    "313": ("Agua", 73),
    "314": ("Telefonía tradicional", 33),
    "315": ("Telefonía celular", 33),
    "316": ("Servicios de telecomunicaciones y satélites", 33),
    "317": ("Servicios de acceso de Internet, redes y procesamiento de información", 34),
    "318": ("Servicios postales y telegráficos", 43),
    "319": ("Servicios integrales y otros servicios", 91),
    "322": ("Arrendamiento de edificios", 66),
    "323": ("Arrendamiento de mobiliario y equipo de administración", 67),
    "324": ("Arrendamiento de equipo e instrumental médico y de laboratorio", 67),
    "325": ("Arrendamiento de equipo de transporte", 67),
    "326": ("Arrendamiento de maquinaria, otros equipos y herramientas", 67),
    "327": ("Arrendamiento de activos intangibles", 31),
    "329": ("Otros arrendamientos", 67),
    "331": ("Servicios legales, de contabilidad, auditoría y relacionados", 51),
    "332": ("Servicios de diseño, arquitectura, ingeniería y actividades relacionadas", 52),
    "333": ("Servicios de consultoría administrativa, procesos, técnica y en TI", 51),
    "334": ("Servicios de capacitación", 54),
    "335": ("Servicios de investigación científica y desarrollo", 53),
    "336": ("Servicios de apoyo administrativo, traducción, fotocopiado e impresión", 47),
    "337": ("Servicios de protección y seguridad", 60),
    "338": ("Servicios de vigilancia", 60),
    "339": ("Servicios profesionales, científicos y técnicos integrales", 91),
    "341": ("Servicios financieros y bancarios", 70),
    "343": ("Servicios de recaudación, traslado y custodia de valores", 70),
    "344": ("Seguros de responsabilidad patrimonial y fianzas", 69),
    "345": ("Seguro de bienes patrimoniales", 69),
    "346": ("Almacenaje, envase y embalaje", 43),
    "347": ("Fletes y maniobras", 43),
    "351": ("Conservación y mantenimiento menor de inmuebles", 30),
    "352": ("Instalación, reparación y mantenimiento de mobiliario y equipo de administración", 30),
    "353": ("Instalación, reparación y mantenimiento de equipo de cómputo y tecnología", 34),
    "354": ("Instalación, reparación y mantenimiento de equipo e instrumental médico", 21),
    "355": ("Reparación y mantenimiento de equipo de transporte", 44),
    "356": ("Reparación y mantenimiento de equipo de defensa y seguridad", 62),
    "357": ("Instalación, reparación y mantenimiento de maquinaria, otros equipos y herramienta", 88),
    "358": ("Servicios de limpieza y manejo de desechos", 63),
    "359": ("Servicios de jardinería y fumigación", 63),
    "361": ("Difusión por radio, televisión y otros medios — mensajes comerciales", 56),
    "362": ("Difusión por radio, televisión y otros medios — mensajes institucionales", 56),
    "363": ("Servicios de creatividad, preproducción y producción de publicidad", 56),
    "365": ("Servicios de la industria fílmica, del sonido y del video", 87),
    "366": ("Servicio de creación y difusión de contenido a través de Internet", 56),
    "369": ("Otros servicios de información", 56),
    "371": ("Pasajes aéreos", 42),
    "372": ("Pasajes terrestres", 78),
    "373": ("Pasajes marítimos, lacustres y fluviales", 78),
    "375": ("Viáticos en el país", 78),
    "376": ("Viáticos en el extranjero", 78),
    "377": ("Gastos de instalación y traslado de menaje", 78),
    "378": ("Servicios integrales de traslado y viáticos", 78),
    "379": ("Otros servicios de traslado y hospedaje", 77),
    "381": ("Gastos de ceremonial", 55),
    "382": ("Gastos de orden social y cultural", 55),
    "383": ("Congresos y convenciones", 55),
    "384": ("Exposiciones", 55),
    "385": ("Gastos de representación", 55),
    "391": ("Servicios funerarios y de cementerios", 91),
    "392": ("Impuestos y derechos", 70),
    "394": ("Sentencias y resoluciones por autoridad competente", 91),
    "396": ("Otros gastos por responsabilidades", 91),
    "399": ("Otros servicios generales", 91),

    # ── Capitulo 4 — Transferencias / Subsidios (not procurement spend categories) ──
    "431": ("Subsidios a la producción", 91),
    "432": ("Subsidios a la distribución", 91),
    "433": ("Subsidios a la inversión", 91),
    "434": ("Subsidios a la prestación de servicios públicos", 91),
    "438": ("Subsidios a entidades federativas y municipios", 91),
    "439": ("Otros subsidios", 91),
    "441": ("Ayudas sociales a personas", 91),
    "444": ("Ayudas sociales a actividades científicas o académicas", 91),

    # ── Capitulo 5 — Bienes Muebles, Inmuebles e Intangibles (CAPITAL) ──
    "511": ("Muebles de oficina y estantería", 46),
    "512": ("Muebles, excepto de oficina y estantería", 46),
    "513": ("Bienes artísticos, culturales y científicos", 83),
    "515": ("Equipo de cómputo y de tecnologías de la información", 32),
    "519": ("Otros mobiliario y equipo de administración", 46),
    "521": ("Equipos y aparatos audiovisuales", 87),
    "522": ("Aparatos deportivos", 83),
    "523": ("Cámaras fotográficas y de video", 87),
    "529": ("Otro mobiliario y equipo educacional y recreativo", 82),
    "531": ("Equipo médico y de laboratorio", 21),
    "532": ("Instrumental médico y de laboratorio", 21),
    "541": ("Vehículos y equipo terrestre", 41),
    "542": ("Carrocerías y remolques", 41),
    "543": ("Equipo aeroespacial", 86),
    "544": ("Equipo ferroviario", 41),
    "545": ("Embarcaciones", 41),
    "546": ("Equipo de defensa y seguridad", 62),
    "549": ("Otros equipos de transporte", 41),
    "551": ("Maquinaria y equipo agropecuario", 86),
    "561": ("Maquinaria y equipo industrial", 86),
    "562": ("Maquinaria y equipo de construcción", 86),
    "563": ("Equipo de generación eléctrica, aparatos y accesorios eléctricos", 86),
    "564": ("Sistemas de aire acondicionado, calefacción y de refrigeración", 86),
    "565": ("Equipo de comunicación y telecomunicación", 33),
    "566": ("Equipos de generación eléctrica, aparatos y accesorios eléctricos", 86),
    "567": ("Herramientas y máquinas-herramienta", 81),
    "569": ("Otros equipos", 86),
    "572": ("Bienes semovientes", 85),
    "577": ("Árboles y plantas", 85),
    "578": ("Otros bienes biológicos", 85),
    "591": ("Software", 31),
    "597": ("Licencias informáticas e intelectuales", 31),

    # ── Capitulo 6 — Inversión Pública / Obra (WORKS) ──
    "612": ("Edificación no habitacional", 26),
    "613": ("Construcción de obras para el abastecimiento de agua, petróleo, gas, electricidad y telecomunicaciones", 28),
    "614": ("División de terrenos y construcción de obras de urbanización", 26),
    "615": ("Construcción de vías de comunicación", 27),
    "616": ("Otras construcciones de ingeniería civil u obra pesada", 26),
    "617": ("Instalaciones y equipamiento en construcciones", 26),
    "619": ("Trabajos de acabados en edificaciones y otros trabajos especializados", 26),
    "621": ("Edificación habitacional", 26),
    "622": ("Edificación no habitacional", 26),
    "623": ("Construcción de obras para el abastecimiento de agua, petróleo, gas, electricidad y telecomunicaciones", 28),
    "624": ("División de terrenos y construcción de obras de urbanización", 26),
    "625": ("Construcción de vías de comunicación", 27),
    "626": ("Otras construcciones de ingeniería civil u obra pesada", 26),
    "627": ("Instalaciones y equipamiento en construcciones", 26),
    "629": ("Trabajos de acabados en edificaciones y otros trabajos especializados", 26),
    "631": ("Estudios, formulación y evaluación de proyectos productivos", 52),
    "632": ("Ejecución de proyectos productivos", 26),
}

# Capitulo-level fallback category for any generica not explicitly mapped above.
CAPITULO_FALLBACK_CATEGORY = {
    1: 91,   # personnel -> general services
    2: 90,   # goods     -> materials & supplies
    3: 91,   # services  -> general services
    4: 91,   # transfers -> general services
    5: 86,   # capital   -> machinery & equipment
    6: 26,   # works     -> building construction
    7: 70,   # financial -> financial services
    8: 91,   # other
    9: 91,
}


def parse_partida(partida_especifica):
    """
    Parse a raw partida_especifica string into structured CUCOP fields.

    Handles single codes ('33901') and consolidated comma-lists
    ('25301, 25401, 53101') by using the FIRST token as the primary classifier.

    Returns dict or None if no usable code:
      {primary, generica, capitulo, capitulo_name_es, spending_class,
       generica_name_es, category_id, is_consolidated, n_partidas}
    """
    if not partida_especifica:
        return None
    raw = str(partida_especifica).strip()
    if not raw:
        return None
    tokens = [t.strip() for t in raw.split(",") if t.strip()]
    if not tokens:
        return None
    primary = tokens[0]
    if len(primary) < 3 or not primary[:3].isdigit():
        return None
    generica = primary[:3]
    capitulo = int(generica[0])
    cap_name, spending_class = CAPITULO.get(capitulo, ("Otros", "Other"))
    if generica in GENERICA_MAP:
        gen_name, category_id = GENERICA_MAP[generica]
    else:
        gen_name = f"Partida genérica {generica}"
        category_id = CAPITULO_FALLBACK_CATEGORY.get(capitulo, 91)
    return {
        "primary": primary,
        "generica": generica,
        "capitulo": capitulo,
        "capitulo_name_es": cap_name,
        "spending_class": spending_class,
        "generica_name_es": gen_name,
        "category_id": category_id,
        "is_consolidated": len(tokens) > 1,
        "n_partidas": len(tokens),
    }


if __name__ == "__main__":
    # Quick self-check / coverage report.
    import collections
    by_cap = collections.Counter(int(g[0]) for g in GENERICA_MAP)
    print(f"GENERICA_MAP: {len(GENERICA_MAP)} genéricas")
    for cap in sorted(by_cap):
        name, cls = CAPITULO[cap]
        print(f"  cap {cap} ({cls:<9}) {by_cap[cap]:>3} genéricas  — {name}")
    for sample in ["33901", "25301, 25401, 53101", "62601", "XYZ", ""]:
        print(f"  parse({sample!r}) -> {parse_partida(sample)}")
