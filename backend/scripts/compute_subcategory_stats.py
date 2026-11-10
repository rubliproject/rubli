"""
compute_subcategory_stats.py

Subcategory definitions (SUBCATEGORY_DEFS: ordered regexes, Compendio supply groups, partidas) and
their aggregates. The per-contract assignment is stored by classify_subcategories.py in
contract_subcategory; this script only aggregates those ids.

Writes:
  subcategory_definitions  — upserted on (category_id, code): ids are stable
  subcategory_stats        — one row per subcategory (+ consolidated_value_pct)
  subcategory_vendor_topn  — top 10 firms by value per subcategory (one row per firm: vendor group,
                             else name without legal suffix)

Run from backend/, after python -m scripts.classify_subcategories:
    python -m scripts.compute_subcategory_stats [--vendors-only]
"""
import json
import logging
import re
import os
import sqlite3
import sys
from pathlib import Path

# category_precompute_chain.sh runs this as `python scripts/compute_subcategory_stats.py`: put backend/ first so
# `api.*` (firm_keys → api.persona_fisica) resolves to this checkout, not whatever else is on the path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.classify_categories import strip_accents  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DB_PATH = Path(os.environ.get("DATABASE_PATH") or Path(__file__).parent.parent / "RUBLI_NORMALIZED.db")

# =============================================================================
# Subcategory definitions
# Format per entry:
#   category_id  — FK to categories table
#   subcategories — ordered list; first match wins (catch_all last)
#     code        — unique slug
#     name_en     — English label
#     name_es     — Spanish label
#     keywords    — Python regex (re.IGNORECASE), pipe-separated alternatives
#     is_catch_all— True = gets everything else in the category
# =============================================================================

SUBCATEGORY_DEFS = [

    # =========================================================================
    # Cat 26 — Building Construction (1.15T MXN)
    # =========================================================================
    {
        "category_id": 26,
        "subcategories": [
            {
                "code": "airports_aviation",
                "name_en": "Airports & Aviation",
                "name_es": "Aeropuertos y Aviación",
                "keywords": r"aeropuerto|terminal aere|pista.{0,10}aterriz|plataforma aeronaut|sala embarque|NAICM|AIFA|AICM",
            },
            {
                "code": "rail_transit",
                "name_en": "Rail & Transit",
                "name_es": "Trenes y Tránsito",
                "keywords": r"tren.{0,10}(maya|interurbano|pasajeros|ligero)|ferroviario|ferrocarril|metro.{0,5}(linea|tramo|construc)|tranvia|BRT|tren de pasajeros",
            },
            {
                "code": "ports_maritime",
                "name_en": "Ports & Maritime",
                "name_es": "Puertos e Infraestructura Marítima",
                "keywords": r"puerto|muelle|dique|rompeolas|escollera|maritim|naval|infraestructura portuaria|terminal portuaria|dos bocas",
            },
            {
                "code": "refineries_industrial",
                "name_en": "Refineries & Industrial Plants",
                "name_es": "Refinerías y Plantas Industriales",
                "keywords": r"refineria|planta.{0,10}(petroquimic|industrial|procesadora|desulfuradora|regeneradora|crudo|gas natural)|tren.{0,5}de.{0,5}(crudo|refinacion)|complejo petroquimic|EPC.{0,10}(planta|refiner)",
            },
            {
                "code": "power_plants",
                "name_en": "Power Plants",
                "name_es": "Plantas Generadoras",
                "keywords": r"planta.{0,10}(electrica|generadora|termoelectrica|ciclo combinado|geotermia)|central.{0,10}(electrica|generadora|termoelectrica|ciclo)|generacion.{0,10}electrica.{0,5}(construccion|obra)",
            },
            {
                "code": "dams_hydraulic",
                "name_en": "Dams & Water Works",
                "name_es": "Presas y Obras Hidráulicas",
                "keywords": r"presa|cortina.{0,10}(hidraulic|presa)|embalse|vaso.{0,10}(hidraulic|presa)|canal.{0,10}riego|sistema.{0,10}riego|planta.{0,10}(tratadora|potabilizadora).{0,10}(construc|obra)|acueducto.{0,10}(construc|proyecto)",
            },
            {
                "code": "public_buildings",
                "name_en": "Public Buildings & Facilities",
                "name_es": "Edificios e Instalaciones",
                "keywords": r"edificio|inmueble|oficinas.{0,10}(construc|obra)|plantel|sede.{0,10}(construc|proyecto)|centro.{0,10}(integracion|civico|comunitario|gobierno)|cuartel|aduana|juzgado|reclusorio|penal",
            },
            {
                "code": "hospitals_clinics",
                "name_en": "Hospitals & Clinics",
                "name_es": "Hospitales y Clínicas",
                "keywords": r"hospital.{0,10}(construc|obra|ampliacion|proyecto)|clinica.{0,10}(construc|proyecto)|unidad.{0,10}medica.{0,10}(construc|proyecto)|IMSS.{0,10}(construc|proyecto|obra)",
            },
            {
                "code": "urban_housing",
                "name_en": "Urban Development & Housing",
                "name_es": "Desarrollo Urbano y Vivienda",
                "keywords": r"urbanizacion|vivienda|habitat|colonia.{0,10}(proyecto|obra)|parque.{0,10}(construccion|rehabilitacion)|plaza.{0,10}(construccion|remodelacion)|desarrollo urbano|mejoramiento.{0,10}(barrio|colonia|zona)",
            },
            {
                "code": "other_construction",
                "name_en": "Other Construction",
                "name_es": "Construcción General",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 20 — Medications & Pharma
    # «Compra consolidada» is NOT a subcategory (2026-11-03): it is how a thing was bought, so it is
    # the is_consolidated flag of contract_subcategory. Classes are tested on title + description;
    # «groups» = Compendio Nacional de Insumos para la Salud supply group cited in the text
    # (020 vacunas · 030 fórmulas · 040 estupefacientes y psicotrópicos; 010 «medicamentos» decides
    # nothing). Buyer names in descriptions («Hospital de Oncología», «Instituto de Cardiología»)
    # must not decide a class, hence oncologic / no bare «cardio».
    # =========================================================================
    {
        "category_id": 20,
        "subcategories": [
            {
                "code": "medical_gases",
                "name_en": "Medical Gases",
                "name_es": "Gases Medicinales",
                "keywords": r"oxigeno.{0,10}(medic|liquid|gaseo)|gas.{0,10}medic|oxido nitroso|nitrogeno.{0,10}liquid|oxigeno medicinal|gases medicinales",
            },
            {
                "code": "vaccines_biologics",
                "name_en": "Vaccines & Biologics",
                "name_es": "Vacunas y Biológicos",
                # «vacunación» alone is the campaign (termos, alimentos, difusión), not the vaccine;
                # «químico biológico» is a lab's name (spot check 2026-11-03: 9/30 wrong)
                "keywords": r"\bvacunas?\b|productos? biologicos?|inmunizacion|bioterap|antisuero|toxoide|antitoxina",
                "groups": ("020",),
            },
            {
                "code": "controlled_substances",
                "name_en": "Narcotics & Psychotropics",
                "name_es": "Estupefacientes y Psicotrópicos",
                # «medicamentos (010) y psicotrópicos (040)» is a general shelf, not this class (spot check 2026-11-03: 25/30)
                "keywords": r"^(?!.*(\b010\b|\b01\.0\b|genericos|lacteos|medicamentos?,? (y|e) (sustancias |bienes )?(psicotrop|narcot|estupef)|medicamentos?, (lacteos|narcot|psicotrop))).*(psicotrop|estupefac|narcotic|sustancias? controlad)",
                "groups": ("040",),
            },
            {
                "code": "antiretrovirals_hiv",
                "name_en": "HIV Antiretrovirals",
                "name_es": "Antirretrovirales (VIH)",
                "keywords": r"antirretrovir|antiretrovir|\bVIH\b|efavirenz|tenofovir|dolutegravir|bictegravir|emtricitabina|lopinavir|raltegravir|darunavir|abacavir|zidovudina",
            },
            {
                "code": "oncology",
                "name_en": "Oncology & Chemotherapy",
                "name_es": "Oncología y Quimioterapia",
                "keywords": r"oncologic|quimioterap|antineoplasic|citostatic|cancer(?!olog)|tumor.{0,10}(tratamiento|medic)|leucemia|linfoma|rituximab|trastuzumab|imatinib|bevacizumab|pembrolizumab|nivolumab",
            },
            {
                "code": "blood_products",
                "name_en": "Blood Products & Clotting Factors",
                "name_es": "Hemoderivados y Factores de Coagulación",
                "keywords": r"hemoderivad|factor.{0,5}(viii|ix|antihemofil|de coagulacion)|antihemofil|albumina humana|inmunoglobulina",
            },
            {
                "code": "insulin_diabetes",
                "name_en": "Insulin & Diabetes",
                "name_es": "Insulina y Diabetes",
                # syringes and lab kits for insulin are curación / laboratorio, not the drug (spot check 2026-11-03: 7/30)
                "keywords": r"^(?!.*(jeringa|\bkits?\b|determinacion|reactivo|elisa|leisa)).*(insulina|diabetes|metformina|hipoglucemiante|glibenclamida|glipizida|sitagliptina|glargina)",
            },
            {
                "code": "antibiotics",
                "name_en": "Antibiotics",
                "name_es": "Antibióticos",
                # antibiotic-detection kits and lab feed are laboratorio (spot check 2026-11-03: 6/30)
                "keywords": r"^(?!.*(\bkits?\b|determinacion|reactivo|delvotest|roedores)).*(antibiot|amoxicilina|ciprofloxacin|cefalospor|ampicilina|azitromicina|clindamicina|metronidazol|vancomicina|meropenem|imipenem|levofloxacin)",
            },
            {
                "code": "cardiovascular",
                "name_en": "Cardiovascular",
                "name_es": "Cardiovascular",
                "keywords": r"antihipertensiv|cardiovascular|captopril|losartan|enalapril|atenolol|amlodipino|carvedilol|metoprolol|ramipril|valsartan|hipertension arterial",
            },
            {
                "code": "analgesics_pain",
                "name_en": "Analgesics & Pain Relief",
                "name_es": "Analgésicos y Dolor",
                "keywords": r"analges|paracetamol|ibuprofeno|naproxeno|diclofenac|tramadol|ketorolaco|piroxicam|morfina|fentanilo|buprenorfina|opioi",
            },
            {
                "code": "formulas_nutrition",
                "name_en": "Formulas & Clinical Nutrition",
                "name_es": "Fórmulas y Nutrición Clínica",
                "keywords": r"formula.{0,15}(lacte|lactant|infantil|enteral|polimeric|nutric)|nutricion.{0,5}(enteral|parenteral|clinica)|dieta polimerica|\bkcal\b|^(?!.*(medicamentos?,|psicotrop|estupef|\b010\b|01\.0)).*\blacteos\b",  # «medicamentos, lácteos y psicotrópicos» = a general shelf
                "groups": ("030",),
            },
            {
                "code": "vitamins_supplements",
                "name_en": "Vitamins & Supplements",
                "name_es": "Vitaminas y Suplementos",
                # «hipoclorito de calcio tabletas» is a disinfectant; a regulatory-monitoring service is no supplement
                # (spot check 2026-11-03: 7/30, the formulas now decide first)
                "keywords": r"^(?!.*(hipoclorito|monitoreo)).*(vitamin|suplemento.{0,10}(nutric|medic|alimentic)|micronutrient|hierro.{0,5}(acido|tablet|capsula)|acido folico|zinc.{0,5}(tablet|capsula)|carbonato de calcio|calcio.{0,5}(tablet|capsula)|multivitamin)",
            },
            {
                "code": "dialysis",
                "name_en": "Dialysis Solutions & Programmes",
                "name_es": "Diálisis (Soluciones y Programas)",
                "keywords": r"dialisis|dializ",
            },
            {
                "code": "pharmacy_services",
                "name_en": "Supply & Dispensing Services",
                "name_es": "Servicios de Abasto y Dispensación",
                "keywords": r"servicio.{0,25}(suministro|abasto|abastecimiento|dispensa|distribucion).{0,25}(medicament|farmac|insumo)|cadena de suministro|administracion.{0,20}cadena|farmacia.{0,10}(subrogad|integral)|dispensacion|unidosis",
            },
            {
                "code": "branded_drugs",
                "name_en": "Patent medicines, class not stated",
                "name_es": "De patente, sin clase en el texto",
                "keywords": r"medicamento.{0,10}patente|medic.{0,5}patentes|compra.{0,10}patentes|\(patente\)|\bpatente\b",
            },
            {
                "code": "generic_drugs",
                "name_en": "Generic medicines, class not stated",
                "name_es": "Genéricos, sin clase en el texto",
                "keywords": r"genericos?\b|generico intercambiable",
            },
            {
                "code": "other_pharma",
                "name_en": "Medicines, class not stated",
                "name_es": "Medicamentos sin clase en el texto",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 57 — Food & Provisions (868B MXN)
    # =========================================================================
    {
        "category_id": 57,
        "subcategories": [
            {
                "code": "basic_basket_despensa",
                "name_en": "Basic Basket / Pantry Goods",
                "name_es": "Despensa y Canasta Básica",
                "keywords": r"despensa|canasta.{0,5}basica|vivere|abarrote|mercancias.{0,5}generales|basicos.{0,5}alimentar",
            },
            {
                "code": "grains_cereals",
                "name_en": "Grains, Cereals & Legumes",
                "name_es": "Granos, Cereales y Legumbres",
                "keywords": r"harina|arroz|frijol|maiz.{0,5}(blanco|amarillo|grano)|lenteja|garbanzo|cereal|avena|pasta.{0,5}(sopa|alimenticia)|soya|trigo|salvado|granola",
            },
            {
                "code": "protein_meat_fish",
                "name_en": "Protein: Meat, Poultry & Fish",
                "name_es": "Proteínas: Carne, Aves y Pescado",
                "keywords": r"carne.{0,10}(res|vacuno|bovina)|pollo|cerdo|pescado|atun|sardina|jamon|salchicha|chorizo|tocino|barbacoa|filete|carnita",
            },
            {
                "code": "dairy_eggs",
                "name_en": "Dairy & Eggs",
                "name_es": "Lácteos y Huevo",
                "keywords": r"leche|queso|yogurt|crema|mantequilla|margarina|huevo|lacteo|suero.{0,5}(leche|lacteo)|formula.{0,5}lactea|requesOn",
            },
            {
                "code": "produce_fruits_veg",
                "name_en": "Fruits & Vegetables",
                "name_es": "Frutas y Verduras",
                "keywords": r"fruta|verdura|naranja|manzana|platano|limon|tomate|jitomate|lechuga|papa.{0,5}(bolsa|kilo|fruta)|cebolla|zanahoria|calabaza|chayote|nopal|pepino|aguacate",
            },
            {
                "code": "processed_packaged",
                "name_en": "Processed & Packaged Foods",
                "name_es": "Alimentos Procesados y Enlatados",
                "keywords": r"galleta|chocolate|dulce|mermelada|mayonesa|catsup|mole|mostaza|vinagre|conserva|enlatado|atole|gelatina|flan|postre|helado|paleta|nuez|cacahuate|almendra",
            },
            {
                "code": "beverages",
                "name_en": "Beverages",
                "name_es": "Bebidas",
                "keywords": r"jugo.{0,5}(embotellado|envasado|fruta)|refresco|bebida.{0,5}(embotellada|carbonatada)|cafe.{0,5}(soluble|tostado|molido)|te.{0,5}(bolsita|caja)|agua.{0,5}(embotellada|purificada).{0,5}(compra|adquisi|producto)",
            },
            {
                "code": "infant_baby_food",
                "name_en": "Infant & Baby Food",
                "name_es": "Alimentos Infantiles",
                "keywords": r"alimento.{0,10}(infantil|bebe|nino)|formula.{0,5}(infantil|lactea)|colado|papilla|puré.{0,10}(bebe|infantil)|leche.{0,5}maternizada",
            },
            {
                "code": "sugar_oils_condiments",
                "name_en": "Sugar, Oils & Condiments",
                "name_es": "Azúcar, Aceites y Condimentos",
                "keywords": r"azucar|aceite.{0,10}(comestible|vegetal|cocina)|sal.{0,5}(molida|refinada|yodada|marina)|manteca|pimienta|canela|oregano|comino|vinagre|chile.{0,5}(seco|polvo|molido)",
            },
            {
                "code": "other_food",
                "name_en": "Other Food & Provisions",
                "name_es": "Otros Alimentos",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 88 — General Maintenance (656B MXN)
    # =========================================================================
    {
        "category_id": 88,
        "subcategories": [
            {
                "code": "oil_fields",
                "name_en": "Oil fields & offshore (Pemex)",
                "name_es": "Campos petroleros y costa afuera (Pemex)",
                "keywords": r"campos? (de )?(burgos|petroler)|bloque.{0,20}(burgos|cuenca|norte|sur)|cuenca de burgos|yacimiento|\bpozos?\b|perforacion|plataformas?.{0,20}(perforacion|marina|costa|autoelevable|semisumergible)|costa (a)?fuera|\bFPSO\b|hidrocarburo|activo integral",
            },
            {
                "code": "pipeline_offshore",
                "name_en": "Pipeline & Offshore Maintenance",
                "name_es": "Mantenimiento de Ductos y Plataformas",
                "keywords": r"manten.{0,20}(ducto|gasoducto|oleoducto|poliducto|pipeline|plataforma.{0,10}(petroler|mar)|buque|embarcacion|maritim|costa afuera|offshore|submarino)",
            },
            {
                "code": "road_infrastructure",
                "name_en": "Road & Infrastructure Maintenance",
                "name_es": "Conservación de Carreteras",
                "keywords": r"manten.{0,20}(carretera|autopista|vialidad|camino.{0,5}federal|camino.{0,5}rural|tramo.{0,5}carretero)|conservacion.{0,10}(carretera|vialidad|camino)|bacheo|sellado.{0,5}grietas|raniurado",
            },
            {
                "code": "buildings_facilities",
                "name_en": "Buildings & Facilities Maintenance",
                "name_es": "Mantenimiento de Inmuebles",
                "keywords": r"manten.{0,20}(inmueble|edificio|instalacion.{0,5}(fisica|general)|planta fisica|infraestructura.{0,5}fisica)|remodelacion|impermeabiliz|rehabilitacion.{0,10}(inmueble|edificio)|adecuacion.{0,10}(inmueble|espacio)",
                "partidas": ("351",),
            },
            {
                "code": "equipment_machinery",
                "name_en": "Equipment & Machinery Maintenance",
                "name_es": "Mantenimiento de Equipos y Maquinaria",
                "keywords": r"manten.{0,20}(equipo|maquinaria|maquina.{0,5}(industrial|pesada)|herramienta|generador|compresor|turbina|motor.{0,5}industrial)|overhaul|mantenimiento.{0,5}preventivo.{0,5}(equipo|maquinaria)",
                "partidas": ("357",),
            },
            {
                "code": "vehicle_fleet",
                "name_en": "Vehicle & Fleet Maintenance",
                "name_es": "Mantenimiento Vehicular",
                "keywords": r"manten.{0,20}(vehiculo|flotilla|automotor|parque.{0,5}vehicular|camion|autobus|motocicleta)|servicio.{0,10}taller|mantenimiento.{0,5}correctivo.{0,5}(vehic|flot)",
                "partidas": ("355",),
            },
            {
                "code": "electrical_systems",
                "name_en": "Electrical & Electronic Systems",
                "name_es": "Mantenimiento Eléctrico / Electrónico",
                "keywords": r"manten.{0,20}(electrico|electronico|sistema.{0,5}electrico|red.{0,5}electrica|subestacion|transformador|tablero.{0,5}electrico|planta.{0,5}electrica)",
            },
            {
                "code": "it_systems",
                "name_en": "IT & Systems Maintenance",
                "name_es": "Mantenimiento de Sistemas IT",
                "keywords": r"manten.{0,20}(sistema.{0,5}informatico|software|computo|aplicacion|plataforma.{0,5}digital|infraestructura.{0,5}tecnolog|equipo.{0,5}computo)|soporte.{0,10}(tecnico|sistema|plataforma).{0,10}manteni",
                "partidas": ("353",),
            },
            {
                "code": "hvac_plumbing",
                "name_en": "HVAC & Plumbing",
                "name_es": "Climatización y Plomería",
                "keywords": r"manten.{0,20}(climatizacion|aire acondicionado|sistema.{0,5}hvac|calefaccion|plomeria|fontaneria|red.{0,5}(agua|hidraulica).{0,10}manten|sistema.{0,5}hidrosanitario)",
            },
            {
                "code": "other_maintenance",
                "name_en": "Maintenance, object not stated",
                "name_es": "Mantenimiento sin objeto en el texto",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 27 — Road & Highway (623B MXN)
    # =========================================================================
    {
        "category_id": 27,
        "subcategories": [
            {
                "code": "toll_highways",
                "name_en": "Toll Highways (Autopistas)",
                "name_es": "Autopistas y Cuotas",
                "keywords": r"autopista|cuota.{0,10}(carretera|autopista)|concesion.{0,10}(carretera|autopista)|peaje|libre de peaje|APP.{0,10}(carretera|autopista)|libramiento.{0,10}(autopista|cuota)",
            },
            {
                "code": "federal_roads",
                "name_en": "Federal Roads",
                "name_es": "Carreteras Federales",
                "keywords": r"carretera.{0,10}federal|libramiento.{0,10}(federal|carretera)|troncal federal|red.{0,5}carretera.{0,5}federal|camino.{0,5}federal",
            },
            {
                "code": "bridges_overpasses",
                "name_en": "Bridges & Overpasses",
                "name_es": "Puentes y Viaductos",
                "keywords": r"puente.{0,10}(vehicular|carretero|peatonal|nuevo)|viaducto|paso.{0,5}(elevado|desnivel|superior|inferior)|distribuidor vial",
            },
            {
                "code": "urban_roads",
                "name_en": "Urban Roads & Viaducts",
                "name_es": "Vialidades Urbanas",
                "keywords": r"calle|avenida|boulevard|periferico.{0,10}(construc|ampliac|obra)|circuito.{0,10}(interior|exterior|vial)|anillo vial|vialidad.{0,5}(urbana|principal|primaria|secundaria)|acceso.{0,10}(urbano|vial)",
            },
            {
                "code": "rural_roads",
                "name_en": "Rural Roads",
                "name_es": "Caminos Rurales",
                "keywords": r"camino.{0,5}rural|terraceria|brecha|camino.{0,5}vecinal|revestimiento.{0,5}(camino|terraceria)|mejoramiento.{0,5}camino.{0,5}rural",
            },
            {
                "code": "tunnels",
                "name_en": "Tunnels",
                "name_es": "Túneles",
                "keywords": r"tunel|socavon|trinchera.{0,10}(carretera|ferroviario|vial)",
            },
            {
                "code": "road_conservation",
                "name_en": "Road Conservation & Repair",
                "name_es": "Conservación y Rehabilitación",
                "keywords": r"conservacion.{0,10}(carretera|camino|vialidad|autopista)|rehabilitacion.{0,10}(carretera|camino|pavimento|tramo)|bacheo|sellado|raniurado|fresado|recarpeteo|refuerzo.{0,10}(pavimento|carretera)",
            },
            {
                "code": "signaling_safety",
                "name_en": "Signaling, Lighting & Safety",
                "name_es": "Señalización, Iluminación y Seguridad Vial",
                "keywords": r"senal.{0,10}(vial|carretera|horizontal|vertical)|marcas.{0,5}viales|semaforo|guardarail|barandal.{0,5}(carretera|vial)|iluminacion.{0,10}(carretera|vial)|equipamiento vial|seguridad vial",
            },
            {
                "code": "other_roads",
                "name_en": "Other Road Works",
                "name_es": "Otras Obras Carreteras",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 22 — Medical Supplies (589B MXN)
    # =========================================================================
    {
        "category_id": 22,
        "subcategories": [
            {
                "code": "oil_offshore_misfiled",
                "name_en": "Offshore oil works (misfiled: «sonda»)",
                "name_es": "Obras petroleras costa afuera (mal clasificadas: «sonda»)",
                "keywords": r"sonda de campeche|costa (a)?fuera|plataformas? (marina|habitacional|de perforacion)|gasoducto|oleoducto|ductos? marino|cable submarino|helicoptero|ku-maloob|procura.{0,40}(construccion|instalacion)",
            },
            {
                "code": "antiretrovirals_misfiled",
                "name_en": "HIV antiretrovirals (medicines filed here)",
                "name_es": "Antirretrovirales (medicamentos clasificados aquí)",
                "keywords": r"antirretrovir|antiretrovir|abacavir|tenofovir|emtricitabina|efavirenz|dolutegravir",
            },
            {
                "code": "injectables_iv",
                "name_en": "Needles, Syringes & IV / Infusion",
                "name_es": "Jeringas, Agujas e Infusión IV",
                "keywords": r"jeringa|aguja.{0,5}(hipoderm|medic)|cateter|suero.{0,5}(fisio|glucosado|fisiologico)|solucion.{0,10}(inyectable|intravenosa|parenteral)|acceso vascular|intravenosa|linea.{0,5}(venosa|arterial)|equipo.{0,10}infusion",
            },
            {
                "code": "surgical_wound",
                "name_en": "Surgical Supplies & Wound Care",
                "name_es": "Suministros Quirúrgicos y Curaciones",
                "keywords": r"gasa|venda|aposito|sutura|guantes.{0,5}(quirurg|latex|nitrilo|esteril)|campo quirurgico|compresas|adhesivo medico|esparadrapo|cinta medica|bata.{0,5}quirurg",
            },
            {
                "code": "dialysis_renal",
                "name_en": "Dialysis & Renal Supplies",
                "name_es": "Diálisis y Suministros Renales",
                "keywords": r"\bDPC?A\b|hemodialisis|dializador|dialisis|dializad|membrana.{0,10}dialisis|filtro.{0,10}hemodialisis|cateter.{0,5}dialisis|liquido.{0,5}dialisis",
            },
            {
                "code": "disposables",
                "name_en": "Medical Disposables",
                "name_es": "Desechables Médicos",
                "keywords": r"desechable|descartable|uso.{0,5}unico|material.{0,5}desechable|consumible.{0,5}medic|material.{0,5}(medico|quirurgico).{0,5}desechable",
            },
            {
                "code": "ppe_protective",
                "name_en": "PPE & Protective Equipment",
                "name_es": "EPP y Equipo de Protección",
                "keywords": r"equipo.{0,10}proteccion.{0,5}personal|mascarilla|cubrebocas|respirador|careta|goggles|googles|guantes.{0,5}examen|gorro.{0,5}medic|calzado.{0,5}medic",
            },
            {
                "code": "dental_supplies",
                "name_en": "Dental Supplies & Materials",
                "name_es": "Materiales Dentales",
                "keywords": r"dental|odontolog|material.{0,5}dental|pieza dental|anestesia.{0,5}dental|composite|amalgama|silicona.{0,5}dental|cementacion|corona dental|endodont",
            },
            {
                "code": "drainage_stoma",
                "name_en": "Drainage, Catheters & Stoma",
                "name_es": "Drenajes, Sondas y Ostomías",
                "keywords": r"sonda.{0,10}(foley|urinaria|nasogas|enteral)|drenaje.{0,5}(herida|medic|quirurg)|ostomia|colostomia|ileostomia|bolsa.{0,5}(ostomia|colostomia)|kateter",
            },
            {
                "code": "lab_consumables",
                "name_en": "Lab Consumables & Tubes",
                "name_es": "Consumibles de Laboratorio",
                "keywords": r"tubo.{0,10}(ensayo|muestra|vacio|vacutainer)|placa.{0,5}(petri|cultivo)|micropipeta|punta.{0,5}micropipeta|vial.{0,5}(muestra|reactivo)|consumible.{0,5}laboratorio|asa.{0,5}microbiolog|medio.{0,5}cultivo",
                "groups": ("080",), "partidas": ("255",),
            },
            {
                "code": "imaging_radiology",
                "name_en": "Imaging & Radiology Supplies",
                "name_es": "Radiología e Imagen",
                "keywords": r"pelicula.{0,5}radiolog|cassette.{0,5}radiolog|medio.{0,5}contraste|gadolinio|material.{0,5}radiolog|placa radiologica|chasis.{0,5}radiolog",
                "groups": ("070",),
            },
            {
                "code": "other_medical_supplies",
                "name_en": "Medical supplies, type not stated",
                "name_es": "Material de curación sin tipo en el texto",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 91 — General Services (762B MXN)
    # =========================================================================
    {
        "category_id": 91,
        "subcategories": [
            {
                "code": "oil_services",
                "name_en": "Oil services: rigs & fields (Pemex)",
                "name_es": "Servicios petroleros: plataformas y yacimientos (Pemex)",
                "keywords": r"yacimiento|hidrocarburo|plataformas? (semisumergible|autoelevable|de perforacion|marina)|barcos? perforador|costa (a)?fuera|\bpozos?\b",
            },
            {
                "code": "vehicle_leasing",
                "name_en": "Vehicle leasing",
                "name_es": "Arrendamiento de vehículos",
                "keywords": r"arrendamiento.{0,40}(vehic|automo|parque vehicular|transporte vehicular|patrulla|camioneta)",
            },
            {
                "code": "transport_logistics",
                "name_en": "Transportation & Logistics Services",
                "name_es": "Transporte y Logística",
                "keywords": r"servicio.{0,15}(transporte|traslado|flete|movilizacion|acarreo)|transporte.{0,10}(personal|materiales|terrestre|maritimo)|logistic|distribucion.{0,10}(servicio|general)|APP.{0,5}S\b",
                "partidas": ("347",),
            },
            {
                "code": "cleaning_hygiene",
                "name_en": "Cleaning & Hygiene Services",
                "name_es": "Limpieza e Higiene",
                "keywords": r"servicio.{0,15}(limpieza|aseo|higiene)|limpieza.{0,10}(general|integral|inmueble|instalacion|edificio)|desinfeccion|fumigacion|sanitiz",
                "partidas": ("358", "359"),
            },
            {
                "code": "security_services",
                "name_en": "Security & Guard Services",
                "name_es": "Seguridad y Vigilancia",
                "keywords": r"servicio.{0,15}(vigilancia|seguridad.{0,10}(privada|integral|perimetral))|guardia|custod|monitoreo.{0,5}seguridad|proteccion.{0,5}instalaciones",
            },
            {
                "code": "food_services",
                "name_en": "Food & Catering Services",
                "name_es": "Alimentación y Servicio de Comedor",
                "keywords": r"servicio.{0,15}(alimentacion|comedor|cocina|comida|racion)|catering|box.{0,5}lunch|banquete|desayuno.{0,10}(servicio|dia)|cena.{0,5}(servicio)|refrig.{0,5}(servicio)",
            },
            {
                "code": "medical_services_outsource",
                "name_en": "Outsourced Medical Services",
                "name_es": "Subrogación de Servicios Médicos",
                "keywords": r"subrogacion|servicio.{0,15}(medic|salud|hospitalario|atencion.{0,5}medica)|prestacion.{0,10}servicio.{0,5}(medic|salud)|atencion.{0,5}medica.{0,5}terceros",
            },
            {
                "code": "professional_technical",
                "name_en": "Professional & Technical Services",
                "name_es": "Servicios Profesionales y Técnicos",
                "keywords": r"servicio.{0,15}(profesional|especializado|tecnico.{0,5}especializado|ingenieria|gestion)|prestacion.{0,5}servicio.{0,5}(profesional|especializado)|asistencia.{0,5}tecnica",
            },
            {
                "code": "administrative_support",
                "name_en": "Administrative & Support Services",
                "name_es": "Servicios Administrativos y de Apoyo",
                "keywords": r"servicio.{0,15}(administr|apoyo.{0,5}administr|complement|auxiliar)|apoyo.{0,5}(operativo|logistic|administrativo)|personal.{0,5}de.{0,5}apoyo|outsourcing.{0,5}(administr|personal)",
            },
            {
                "code": "it_digital_services",
                "name_en": "IT & Digital Services",
                "name_es": "Servicios Digitales y TI",
                "keywords": r"servicio.{0,15}(informatica|tecnolog|computo|digital|sistema.{0,5}informatico)|soporte.{0,5}tecnico.{0,5}informatico|help.{0,5}desk|mesa.{0,5}ayuda|desarrollo.{0,5}(sistema|software|aplicacion)",
            },
            {
                "code": "other_services",
                "name_en": "Services, type not stated",
                "name_es": "Servicios sin tipo en el texto",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 24 — Hospital Services (391B MXN)
    # =========================================================================
    {
        "category_id": 24,
        "subcategories": [
            {
                "code": "pps_hospitals",
                "name_en": "PPS hospitals (long-term service contracts)",
                "name_es": "Hospitales PPS (contratos de servicios a largo plazo)",
                "keywords": r"\bPPS\b|proyecto (para|de) (la )?prestacion de servicios|prestacion de servicios.{0,15}largo plazo",
            },
            {
                "code": "hospital_facility_services",
                "name_en": "Hospital cleaning & security",
                "name_es": "Limpieza y vigilancia de hospitales",
                "keywords": r"limpieza|vigilancia|seguridad subrogada",
            },
            {
                "code": "medical_outsourcing",
                "name_en": "Medical Outsourcing / Subrogation",
                "name_es": "Subrogación de Servicios Médicos",
                "keywords": r"subrogacion|subrogad|servicio.{0,10}medic.{0,10}(subrogado|contratado|externo)|atencion.{0,10}medica.{0,10}(terceros|contratado|integral)|administracion.{0,40}(servicio medico|atencion medica)|convenio.{0,10}(medic|salud)",
            },
            {
                "code": "ambulance_emergency",
                "name_en": "Ambulance & Emergency Services",
                "name_es": "Ambulancias y Emergencias",
                "keywords": r"ambulancia|urgencia.{0,5}medica|emergencia.{0,5}medica|traslado.{0,10}(medic|paciente)|servicio.{0,10}(urgencia|emergencia).{0,5}medic",
            },
            {
                "code": "dialysis_services",
                "name_en": "Dialysis & Renal Care Services",
                "name_es": "Servicios de Diálisis",
                "keywords": r"servicio.{0,10}hemodialisis|unidad.{0,5}dialisis|dialisis.{0,10}(servicio|prestacion)|hemodialisis.{0,10}(servicio|contratacion)",
            },
            {
                "code": "clinical_diagnostics",
                "name_en": "Clinical Diagnostics & Imaging",
                "name_es": "Diagnóstico Clínico e Imagen",
                "keywords": r"servicio.{0,10}(laboratorio.{0,5}clinico|diagnost|imagen.{0,5}medic|radiolog|tomograf|resonancia)|analisis.{0,5}clinico|prueba.{0,5}(diagnostic|laboratorio)|estudio.{0,5}medic",
            },
            {
                "code": "surgery_procedures",
                "name_en": "Surgery & Medical Procedures",
                "name_es": "Cirugías y Procedimientos",
                "keywords": r"cirugia|intervencion.{0,5}quirurg|operacion.{0,5}medic|procedimiento.{0,5}(medic|quirurg)|endoscopia|cateterismo|artroscopia",
            },
            {
                "code": "rehabilitation",
                "name_en": "Rehabilitation & Therapy",
                "name_es": "Rehabilitación y Terapia",
                "keywords": r"rehabilitacion.{0,5}(medic|fisica|profesional)|fisioterapia|terapia.{0,5}(fisica|ocupacional|del lenguaje|respiratoria)|medicina.{0,5}fisica|CRIT\b",
            },
            {
                "code": "dental_services",
                "name_en": "Dental Services",
                "name_es": "Servicios Odontológicos",
                "keywords": r"servicio.{0,10}(dental|odontolog|estomatolog)|clinica.{0,5}dental|consulta.{0,5}dental|odontolog|estomatolog",
            },
            {
                "code": "mental_health",
                "name_en": "Mental Health Services",
                "name_es": "Salud Mental",
                "keywords": r"salud.{0,5}mental|psicolog|psiquiatria|psiquiatrico|terapia.{0,5}psicolog|atencion.{0,5}psicolog",
            },
            {
                "code": "other_hospital",
                "name_en": "Other Hospital Services",
                "name_es": "Otros Servicios Hospitalarios",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 28 — Water Infrastructure (387B MXN)
    # =========================================================================
    {
        "category_id": 28,
        "subcategories": [
            {
                "code": "dams_reservoirs",
                "name_en": "Dams & Reservoirs",
                "name_es": "Presas y Embalses",
                "keywords": r"presa|cortina.{0,5}(hidraulic|presa|agua)|embalse|vaso.{0,5}(presa|hidraulic|almacenam)|represa|bordo.{0,5}agua",
            },
            {
                "code": "water_treatment",
                "name_en": "Water Treatment Plants",
                "name_es": "Plantas de Tratamiento",
                "keywords": r"planta.{0,10}(tratadora|tratamiento|potabilizadora|desalinizadora|purificadora)|tratamiento.{0,5}agua.{0,5}(potable|residual|servida)|planta.{0,10}(agua.{0,5}potable|agua.{0,5}residual)|PTAR|PTAP",
            },
            {
                "code": "distribution_networks",
                "name_en": "Water Distribution Networks",
                "name_es": "Redes de Distribución",
                "keywords": r"red.{0,10}(hidraulica|agua.{0,5}potable|distribucion.{0,5}agua)|tuberia.{0,10}(agua|hidraulica)|red.{0,5}de.{0,5}agua|sistema.{0,5}de.{0,5}agua.{0,5}potable|linea.{0,5}conduccion",
            },
            {
                "code": "drainage_sewage",
                "name_en": "Drainage & Sewage",
                "name_es": "Drenaje y Alcantarillado",
                "keywords": r"drenaje|alcantarillado|colector.{0,5}(sanitario|pluvial|principal)|red.{0,5}drenaje|emisor|interceptor.{0,5}(sanitario|pluvial)|sistema.{0,5}(alcantarillado|drenaje)|canal.{0,5}(aguas.{0,5}negras|sanitario)",
            },
            {
                "code": "irrigation",
                "name_en": "Irrigation Systems",
                "name_es": "Riego y Agricultura",
                "keywords": r"canal.{0,5}riego|sistema.{0,5}riego|distrito.{0,5}riego|obra.{0,5}irrigacion|infraestructura.{0,5}hidro.{0,5}agricola|modulo.{0,5}riego",
            },
            {
                "code": "flood_control",
                "name_en": "Flood Control",
                "name_es": "Control de Inundaciones",
                "keywords": r"control.{0,5}inundacion|defensa.{0,5}riberina|bordo.{0,5}(proteccion|desvio)|dique.{0,5}(proteccion|contencion)|obra.{0,5}(proteccion.{0,5}inundacion|control.{0,5}avenida)|cauce|encauzamiento",
            },
            {
                "code": "pumping_stations",
                "name_en": "Pumping Stations",
                "name_es": "Plantas de Bombeo",
                "keywords": r"planta.{0,5}(bombo|bombeo)|estacion.{0,5}(bombeo|bomba)|carcamo|rebombeo|planta.{0,5}de.{0,5}(bombeo|rebombeo)|cisterna.{0,5}(obra|construccion)",
            },
            {
                "code": "desalination",
                "name_en": "Desalination",
                "name_es": "Desalinización",
                "keywords": r"desaliniz|desaladora|planta.{0,5}desalinizadora|osmosis.{0,5}inversa|agua.{0,5}desalada",
            },
            {
                "code": "other_water",
                "name_en": "Other Water Works",
                "name_es": "Otras Obras Hidráulicas",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 21 — Medical Equipment (251B MXN)
    # =========================================================================
    {
        "category_id": 21,
        "subcategories": [
            {
                "code": "imaging_diagnostic",
                "name_en": "Imaging & Diagnostic Equipment",
                "name_es": "Equipo de Imagen y Diagnóstico",
                "keywords": r"tomograf|resonancia.{0,5}magnetica|rayos.{0,5}(x|gamma)|ultrasonido|ecografo|equipo.{0,5}(imagen|radiolog|diagnostico.{0,5}imagen)|mamograf|densitometro",
            },
            {
                "code": "surgical_equipment",
                "name_en": "Surgical & OR Equipment",
                "name_es": "Equipo Quirúrgico",
                "keywords": r"equipo.{0,10}quirurg|sala.{0,5}operaciones|mesa.{0,5}quirurg|lampara.{0,5}quirurg|anestesia.{0,5}(equipo|maquina)|electrobisturi|instrumental.{0,5}quirurg",
            },
            {
                "code": "icu_monitoring",
                "name_en": "ICU, Monitoring & Life Support",
                "name_es": "UCI, Monitoreo y Soporte Vital",
                "keywords": r"monitor.{0,10}(paciente|cardiaco|signos vitales)|ventilador|respirador|desfibrilador|equipo.{0,5}(UCI|terapia.{0,5}intensiva|cuidados.{0,5}intensivos)|oximetro|electrocardiog",
            },
            {
                "code": "laboratory_equipment",
                "name_en": "Laboratory Equipment",
                "name_es": "Equipo de Laboratorio",
                "keywords": r"equipo.{0,10}laboratorio|analizador.{0,5}(hematolog|quimic|bioquimic|inmuno|urina)|centrifuga|microscopio|espectro|cromatograf|termociclador|PCR.{0,10}(equipo|maquina)",
            },
            {
                "code": "prosthetics_implants",
                "name_en": "Prosthetics & Implants",
                "name_es": "Prótesis e Implantes",
                "keywords": r"protesis|implante|ortoped|endoprotesis|marcapaso|stent|valvula.{0,5}cardiaca|implante.{0,5}(coclear|mamario|dental)|cadera.{0,5}(protesis|implante)|rodilla.{0,5}(protesis|implante)",
            },
            {
                "code": "dental_equipment",
                "name_en": "Dental Equipment",
                "name_es": "Equipo Odontológico",
                "keywords": r"equipo.{0,5}(dental|odontolog)|sillon.{0,5}dental|unidad.{0,5}dental|pieza.{0,5}mano.{0,5}dental|compresor.{0,5}dental",
            },
            {
                "code": "rehabilitation_equipment",
                "name_en": "Rehabilitation Equipment",
                "name_es": "Equipo de Rehabilitación",
                "keywords": r"equipo.{0,10}rehabilitacion|electroterapia|hidroterapia|ultrasonido.{0,5}terapeutic|silla.{0,5}(ruedas|discapacidad)|andadera|muleta|caminadora.{0,5}(rehabilit|terapia)",
            },
            {
                "code": "sterilization",
                "name_en": "Sterilization Equipment",
                "name_es": "Equipo de Esterilización",
                "keywords": r"esterilizacion|autoclave|esterilizadora|camara.{0,5}(germicida|uv|ultravioleta)|lavadora.{0,5}(instrumental|quirurg)|equipo.{0,5}esteriliz",
            },
            {
                "code": "other_medical_equip",
                "name_en": "Other Medical Equipment",
                "name_es": "Otro Equipo Médico",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 37 — Fuels & Lubricants (198B MXN)
    # =========================================================================
    {
        "category_id": 37,
        "subcategories": [
            {
                "code": "gasoline_diesel",
                "name_en": "Gasoline & Diesel (Vehicle)",
                "name_es": "Gasolina y Diésel Vehicular",
                "keywords": r"gasolina|diesel.{0,10}(vehic|auto|camion|flota)|combustible.{0,10}vehic|combustible.{0,5}(automotor|terrestre)|vales.{0,5}(gasolina|combustible)|tarjeta.{0,5}(gasolina|combustible)",
            },
            {
                "code": "natural_gas",
                "name_en": "Natural Gas",
                "name_es": "Gas Natural",
                "keywords": r"gas.{0,5}natural|GNL|gas licuado.{0,5}(natural|petrolero)|suministro.{0,5}gas.{0,5}natural|transporte.{0,5}gas.{0,5}natural|gasoducto",
            },
            {
                "code": "nuclear_fuel",
                "name_en": "Nuclear Fuel",
                "name_es": "Combustible Nuclear",
                "keywords": r"combustible.{0,5}nuclear|uranio|enriquecimiento.{0,5}(uranio|nuclear)|conversion.{0,5}(nuclear|uranio)|pellets.{0,5}nuclear",
            },
            {
                "code": "steam_thermal",
                "name_en": "Steam & Thermal Energy",
                "name_es": "Vapor y Energía Térmica",
                "keywords": r"vapor.{0,10}(generacion|agua|saturado|sobrecalentado)|agua.{0,5}desmineralizada|condensado.{0,5}(vapor|agua)|planta.{0,5}(vapor|termica).{0,5}(servicio|suministro)",
            },
            {
                "code": "lp_gas",
                "name_en": "LP Gas & Propane",
                "name_es": "Gas LP y Propano",
                "keywords": r"gas.{0,5}lp\b|gas.{0,5}propano|gas.{0,5}butano|gasLP|servicio.{0,5}gas.{0,5}(lp|licuado.{0,5}petroleo)|suministro.{0,5}gas.{0,5}lp",
            },
            {
                "code": "aviation_fuel",
                "name_en": "Aviation Fuel (Turbosina)",
                "name_es": "Turbosina y Combustible Aéreo",
                "keywords": r"turbosina|jet.{0,5}(fuel|a1|a-1)|combustible.{0,5}(aereo|aviacion|aeron)|kero",
            },
            {
                "code": "lubricants_oils",
                "name_en": "Lubricants & Industrial Oils",
                "name_es": "Lubricantes y Aceites Industriales",
                "keywords": r"lubricante|aceite.{0,5}(motor|hidraulico|turbina|compresor|industrial|mineral)|grasa.{0,5}(lubricante|industrial|mecanica)|fluido.{0,5}(hidraulico|refrigerante)",
            },
            {
                "code": "other_fuels",
                "name_en": "Other Fuels",
                "name_es": "Otros Combustibles",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 40 — Oil & Gas Operations (190B MXN)
    # =========================================================================
    {
        "category_id": 40,
        "subcategories": [
            {
                "code": "drilling",
                "name_en": "Drilling Operations",
                "name_es": "Perforación",
                "keywords": r"perforacion|taladro.{0,5}(perfor|marina|terrestre)|plataforma.{0,5}(perforacion|semisum)|contrato.{0,5}perforacion|pozo.{0,5}(perfor|desarrollo|exploratorio)",
            },
            {
                "code": "platform_vessels",
                "name_en": "Offshore Platforms & Vessels",
                "name_es": "Plataformas y Embarcaciones Marinas",
                "keywords": r"plataforma.{0,5}(marina|petrolera|offshore|semisumergible|FPSO|jackin)|FPSO|buque.{0,5}(perforac|servicio|apoyo|grua)|embarcacion.{0,5}(marina|apoyo)|barco.{0,5}(servicio|grua)",
            },
            {
                "code": "pipelines_ducts",
                "name_en": "Pipelines & Ducts",
                "name_es": "Ductos y Tuberías",
                "keywords": r"ducto|gasoducto|oleoducto|poliducto|linea.{0,5}(conduccion|submarina|ducto)|tendido.{0,5}(ducto|linea)|sistema.{0,5}ductos|tuberia.{0,5}(submarina|submergida|offshore)",
            },
            {
                "code": "refining_processing",
                "name_en": "Refining & Processing",
                "name_es": "Refinación y Procesamiento",
                "keywords": r"refinacion|procesamiento.{0,5}(crudo|gas|hidrocarburo)|planta.{0,5}procesadora|planta.{0,5}compresora|petroquimic|crudo.{0,5}(procesamiento|refinacion)",
            },
            {
                "code": "maintenance_ops",
                "name_en": "O&G Maintenance & Operations",
                "name_es": "Mantenimiento de Instalaciones O&G",
                "keywords": r"manten.{0,20}(instalacion.{0,5}(pemex|cfe|gas|petroleo)|plataforma|equipos.{0,5}(explorac|produc))|mantenimiento.{0,5}integral.{0,5}(plataforma|instalacion)",
            },
            {
                "code": "geoscience",
                "name_en": "Geoscience & Exploration",
                "name_es": "Geociencias y Exploración",
                "keywords": r"exploracion.{0,5}(petroleo|gas|hidrocarburo)|sismica|estudio.{0,5}(geologico|geofisico|geoquimico)|prospectiva|modelado.{0,5}(reservorio|geologico)|core.{0,5}(analisis|muestra)",
            },
            {
                "code": "other_oil_gas",
                "name_en": "Other O&G Operations",
                "name_es": "Otras Operaciones O&G",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 32 — Hardware & Computers (99B MXN)
    # =========================================================================
    {
        "category_id": 32,
        "subcategories": [
            {
                "code": "servers_storage",
                "name_en": "Servers & Storage",
                "name_es": "Servidores y Almacenamiento",
                "keywords": r"servidor|storage|almacenamiento.{0,5}(datos|digital|san|nas)|rack|blade|SAN\b|NAS\b|datacenter|data.{0,5}center",
            },
            {
                "code": "workstations_laptops",
                "name_en": "Workstations, PCs & Laptops",
                "name_es": "Equipos de Cómputo y Laptops",
                "keywords": r"computadora|laptop|notebook|desktop|workstation|pc\b|ordenador|equipo.{0,5}(computo|escritorio|personal)|all.{0,5}in.{0,5}one",
            },
            {
                "code": "printers_scanners",
                "name_en": "Printers & Scanners",
                "name_es": "Impresoras y Escáneres",
                "keywords": r"impresora|scanner|escaner|copiadora|multifuncional|plotter|fax.{0,5}(maquina|equipo)|digitalizador.{0,5}(documento|imagen)",
            },
            {
                "code": "network_equipment",
                "name_en": "Network Equipment",
                "name_es": "Equipo de Red",
                "keywords": r"switch|router|firewall|access.{0,5}point|punto.{0,5}acceso|equipo.{0,5}(red|networking|comunicaciones)|cisco|ubiquiti|hub.{0,5}(red|switch)|patch.{0,5}panel",
            },
            {
                "code": "peripherals",
                "name_en": "Peripherals & Accessories",
                "name_es": "Periféricos y Accesorios",
                "keywords": r"monitor|pantalla|teclado|mouse|raton|ups.{0,5}(equipo|no.break|no-break)|no.{0,5}break|proyector|pantalla.{0,5}(proyeccion|interactiva)|cargador|adaptador.{0,5}(video|red|usb)",
            },
            {
                "code": "pos_kiosks",
                "name_en": "POS, Kiosks & Terminals",
                "name_es": "Terminales y Kioscos",
                "keywords": r"terminal.{0,5}(punto.{0,5}venta|pos|cobro|pago)|kiosk|cajero|lector.{0,5}(tarjeta|biometrico|huella|codigo.{0,5}barras)|equipo.{0,5}cobro",
            },
            {
                "code": "other_hardware",
                "name_en": "Other Hardware",
                "name_es": "Otro Hardware",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 33 — Telecom & Networks (77B MXN)
    # =========================================================================
    {
        "category_id": 33,
        "subcategories": [
            {
                "code": "fiber_broadband",
                "name_en": "Fiber Optic & Broadband",
                "name_es": "Fibra Óptica y Banda Ancha",
                "keywords": r"fibra.{0,5}optica|cable.{0,5}fibra|banda.{0,5}ancha|red.{0,5}(fibra|broadband)|tendido.{0,5}(fibra|cable.{0,5}optico)|FO\b",
            },
            {
                "code": "mobile_wireless",
                "name_en": "Mobile & Wireless",
                "name_es": "Móvil e Inalámbrico",
                "keywords": r"telefono.{0,5}(celular|movil)|servicio.{0,5}(celular|movil|wireless)|radiocomunicacion|radio.{0,5}(enlace|frecuencia|digital|troncal)|push.{0,5}to.{0,5}talk",
            },
            {
                "code": "satellite",
                "name_en": "Satellite Communications",
                "name_es": "Comunicaciones Satelitales",
                "keywords": r"satelit|VSAT|comunicacion.{0,5}satelital|enlace.{0,5}satelit|antena.{0,5}satelital|banda.{0,5}(ku|ka|c).{0,5}satelit",
            },
            {
                "code": "telephone_pbx",
                "name_en": "Telephone & PBX",
                "name_es": "Telefonía y Conmutadores",
                "keywords": r"conmutador|pbx|centrex|telefonia|linea.{0,5}telefonica|telefono.{0,5}(fijo|ip|voip)|servicio.{0,5}(telefonia|voz)",
            },
            {
                "code": "data_center_cloud",
                "name_en": "Data Center & Cloud",
                "name_es": "Centro de Datos y Nube",
                "keywords": r"data.{0,5}center|datacenter|nube|cloud|co-location|colocation|hosting|infraestructura.{0,5}(nube|cloud|virtual)",
            },
            {
                "code": "other_telecom",
                "name_en": "Other Telecom",
                "name_es": "Otras Telecomunicaciones",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 90 — Materials & Supplies (257B MXN)
    # =========================================================================
    {
        "category_id": 90,
        "subcategories": [
            {
                "code": "rolling_stock",
                "name_en": "Railway rolling stock & systems",
                "name_es": "Material rodante y sistemas ferroviarios",
                "keywords": r"material rodante|sistemas? ferroviari|tren (maya|interurbano|electrico|ligero)",
            },
            {
                "code": "coal_misfiled",
                "name_en": "Thermal coal (a fuel filed here)",
                "name_es": "Carbón mineral térmico (combustible clasificado aquí)",
                "keywords": r"carbon mineral|carbon termico",
            },
            {
                "code": "digital_tv_sets",
                "name_en": "Digital TV sets (analogue switch-off)",
                "name_es": "Televisores digitales (transición a la TDT)",
                "keywords": r"televisor",
            },
            {
                "code": "construction_packages",
                "name_en": "Construction-material packages",
                "name_es": "Paquetes de material de construcción",
                "keywords": r"materiale?s? de construccion",
            },
            {
                "code": "steel_metals",
                "name_en": "Steel, Metals & Structural",
                "name_es": "Acero, Metales y Estructuras",
                "keywords": r"acero|hierro|metal|lamina|varilla.{0,5}(acero|corrugada)|perfil.{0,5}(estructural|metalico)|tubo.{0,5}(acero|galvanizado|inoxidable)|fluxeria|placa.{0,5}acero|estructura.{0,5}metalica",
                "partidas": ("247",),
            },
            {
                "code": "cement_concrete",
                "name_en": "Cement, Concrete & Aggregates",
                "name_es": "Cemento, Concreto y Agregados",
                "keywords": r"cemento|concreto|mortero|block.{0,5}(construc|cemento)|ladrillo|grava|arena.{0,5}(construc|gruesa|fina)|tabique|tabicón",
                "partidas": ("242",),
            },
            {
                "code": "electrical_materials",
                "name_en": "Electrical Materials & Wiring",
                "name_es": "Materiales Eléctricos y Cableado",
                "keywords": r"cable.{0,5}(electr|cobre|utp|red|poder)|conductor.{0,5}electrico|interruptor.{0,5}(electr|termomagnet)|tablero.{0,5}(electr|distribucion)|material.{0,5}electrico|contacto.{0,5}electr|ducto.{0,5}electr",
            },
            {
                "code": "plumbing_hydraulic",
                "name_en": "Plumbing & Hydraulic Materials",
                "name_es": "Plomería y Materiales Hidráulicos",
                "keywords": r"tuberia.{0,5}(pvc|cpvc|hdpe|hidraulica|galvanizada|cobre)|valvula.{0,5}(hidraulica|control|bola|compuerta)|bomba.{0,5}(agua|hidraulica|centrifuga)|tinaco|cisterna.{0,5}material|sanitario.{0,5}material",
            },
            {
                "code": "chemical_industrial",
                "name_en": "Chemicals & Industrial Compounds",
                "name_es": "Químicos e Insumos Industriales",
                "keywords": r"sustancia.{0,5}quimica|quimico.{0,5}(industrial|agricola)|reactivo.{0,5}quimic|solvente|acido.{0,5}(clor|sulfur|nitric|acetico)|hipoclorito|polimero|resina|adhesivo.{0,5}industrial",
            },
            {
                "code": "lumber_wood",
                "name_en": "Lumber & Wood Products",
                "name_es": "Madera y Productos de Madera",
                "keywords": r"madera|tablones|triplay|duela|panel.{0,5}(madera|mdf|fibra)|tabla.{0,5}(madera|roca)|machimbre",
                "partidas": ("244",),
            },
            {
                "code": "tools_hardware",
                "name_en": "Tools & Hardware",
                "name_es": "Herramientas y Ferretería",
                "keywords": r"herramienta|ferreteria|taladro|soldadura|llave.{0,5}(inglesa|allen|española)|desarmador|tornillo|tuerca|clavo|broca|cortadora|esmeriladora",
            },
            {
                "code": "other_materials",
                "name_en": "Other Materials & Supplies",
                "name_es": "Otros Materiales",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 86 — Machinery & Equipment (221B MXN)
    # =========================================================================
    {
        "category_id": 86,
        "subcategories": [
            {
                "code": "coal_misfiled",
                "name_en": "Thermal coal (CFE; a fuel filed here)",
                "name_es": "Carbón mineral térmico (CFE; combustible clasificado aquí)",
                "keywords": r"carbon",
            },
            {
                "code": "power_projects",
                "name_en": "CFE generation & transmission projects",
                "name_es": "Proyectos de generación y transmisión (CFE)",
                "keywords": r"^\s*\d{3}\s+(CC|CCC|CH|CT|CG|CCI|RM|SE|LT|SLT|SUV)\b|\d{4}TOQ\d|ciclo combinado|perdidas de energia|lineas? de transmision",
            },
            {
                "code": "heavy_construction_equip",
                "name_en": "Heavy Construction Equipment",
                "name_es": "Maquinaria Pesada de Construcción",
                "keywords": r"retroexcavadora|bulldozer|motoconformadora|compactadora|cargador.{0,5}(frontal|retroexcavadora)|pavimentadora|motoniveladora|grua.{0,5}(torre|movil|hidraulica)|camion.{0,5}volteo",
                "partidas": ("562",),
            },
            {
                "code": "generators_power",
                "name_en": "Generators & Power Equipment",
                "name_es": "Generadores y Equipos de Potencia",
                "keywords": r"generador.{0,5}(electrico|diesel|gas)|planta.{0,5}electrica.{0,5}(portatil|emergencia)|ups.{0,5}(industrial|gran|kva)|transformador.{0,5}(electrico|distribucion)|subestacion",
                "partidas": ("563", "566"),
            },
            {
                "code": "industrial_machinery",
                "name_en": "Industrial Machinery",
                "name_es": "Maquinaria Industrial",
                "keywords": r"maquinaria.{0,5}(industrial|manufactura|proceso)|torno|fresa|fresadora|prensa.{0,5}hidraulica|cortadora.{0,5}(laser|plasma|industrial)|compresor.{0,5}industrial",
                "partidas": ("561",),
            },
            {
                "code": "agri_equipment",
                "name_en": "Agricultural Machinery",
                "name_es": "Maquinaria Agrícola",
                "keywords": r"tractor.{0,5}(agricola|campo)|sembradora|cosechadora|arado|maquinaria.{0,5}(agricola|agropecuaria)|equipo.{0,5}(agricola|agropecuario)",
                "partidas": ("551",),
            },
            {
                "code": "pumps_compressors",
                "name_en": "Pumps & Compressors",
                "name_es": "Bombas y Compresores",
                "keywords": r"bomba.{0,5}(industrial|centrifuga|sumergible|hidraulica|dosificadora)|compresor.{0,5}(industrial|aire|gas)|motocompresor|turbocompresor",
            },
            {
                "code": "scientific_lab_equip",
                "name_en": "Scientific & Lab Equipment",
                "name_es": "Equipo Científico y de Laboratorio",
                "keywords": r"equipo.{0,5}(cientifico|laboratorio.{0,5}(analisis|investigacion))|espectro|cromatograf|microscopio.{0,5}(electr|optic)|incubadora.{0,5}(laboratorio|cultivo)",
            },
            {
                "code": "other_machinery",
                "name_en": "Other Machinery & Equipment",
                "name_es": "Otra Maquinaria",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 41 — Vehicles & Fleet (79B MXN)
    # =========================================================================
    {
        "category_id": 41,
        "subcategories": [
            {
                "code": "passenger_vehicles",
                "name_en": "Passenger Cars & SUVs",
                "name_es": "Automóviles y Camionetas",
                "keywords": r"automovil|sedan|suv\b|camioneta.{0,5}(pasajero|pick.up|doble.cabina)|pick.{0,5}up|vehiculo.{0,5}(particular|pasajero|oficial)",
            },
            {
                "code": "buses_vans",
                "name_en": "Buses & Passenger Vans",
                "name_es": "Autobuses y Vans",
                "keywords": r"autobus|camion.{0,5}(pasajero|urbano|escolar)|van.{0,5}(pasajero|combi)|minibus|microbus|unidad.{0,5}(transporte|autobus)",
            },
            {
                "code": "trucks_cargo",
                "name_en": "Trucks & Cargo Vehicles",
                "name_es": "Camiones de Carga",
                "keywords": r"camion.{0,5}(carga|volteo|pipa|grua|rabon|torton)|tracto.{0,5}camion|tractor.{0,5}(carga|remolque)|grua.{0,5}vehiculo",
            },
            {
                "code": "emergency_vehicles",
                "name_en": "Emergency & Police Vehicles",
                "name_es": "Vehículos de Emergencia y Policiales",
                "keywords": r"ambulancia|patrulla|motopatrulla|vehiculo.{0,5}(emergencia|policial|seguridad|policia)|camion.{0,5}bomberos|bomberos.{0,5}(vehiculo|unidad)",
            },
            {
                "code": "specialized_vehicles",
                "name_en": "Specialized Vehicles",
                "name_es": "Vehículos Especializados",
                "keywords": r"vehiculo.{0,5}(blindado|anfibio|todo.{0,5}terreno|4x4)|maquina.{0,5}vial|barredora|pipa.{0,5}agua|cisterna.{0,5}vehiculo|trailer.{0,5}laboratorio",
            },
            {
                "code": "motorcycles",
                "name_en": "Motorcycles & Bicycles",
                "name_es": "Motocicletas y Bicicletas",
                "keywords": r"motocicleta|moto\b|bicicleta|cuatrimoto|scooter",
            },
            {
                "code": "other_vehicles",
                "name_en": "Other Vehicles",
                "name_es": "Otros Vehículos",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 60 — Private Security (104B MXN)
    # =========================================================================
    {
        "category_id": 60,
        "subcategories": [
            {
                "code": "guard_services",
                "name_en": "Guard & Patrol Services",
                "name_es": "Guardias y Rondines",
                "keywords": r"guardia.{0,5}(seguridad|privada)|vigilante|custodio|rondines|vigilancia.{0,5}(fisica|activa|pasiva|desarmada)|personal.{0,5}seguridad|servicio.{0,25}(?<!video)vigilancia|(?<!video)vigilancia (a|en|de|para) |seguridad privada|intramuros|^\s*(contrato de )?vigilancia",
                "partidas": ("338",),
            },
            {
                "code": "cash_transport",
                "name_en": "Cash & Valuables Transport",
                "name_es": "Traslado de Valores",
                "keywords": r"traslado.{0,5}(valor|efectivo|numerario|dinero)|custodia.{0,5}(valor|numerario)|vehiculo.{0,5}blindado.{0,5}valor",
            },
            {
                "code": "alarm_monitoring",
                "name_en": "Alarm & Electronic Monitoring",
                "name_es": "Alarmas y Monitoreo Electrónico",
                "keywords": r"videovigilancia|alarma|monitoreo.{0,5}(electronico|seguridad|alarma)|central.{0,5}(monitoreo|alarma)|circuito.{0,5}cerrado|CCTV|camara.{0,5}(seguridad|vigilancia)",
            },
            {
                "code": "perimeter_access",
                "name_en": "Perimeter & Access Control",
                "name_es": "Control de Acceso y Perímetro",
                "keywords": r"control.{0,5}acceso|acceso.{0,5}(biometrico|control|seguridad)|torniquete|barrera.{0,5}(acceso|vehicular)|lector.{0,5}(huellas|facial|biometrico).{0,5}acceso",
            },
            {
                "code": "other_security",
                "name_en": "Other Security Services",
                "name_es": "Otros Servicios de Seguridad",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 23 — Laboratorio y Diagnóstico (added 2026-11-03: the text separates outsourced lab
    # services from reagents, equipment and materials; «biológicos y vacunas» and Pemex well
    # treatments land here only because the category regex matches «biolog» / «laboratorio»)
    # =========================================================================
    {
        "category_id": 23,
        "subcategories": [
            {
                "code": "lab_services",
                "name_en": "Outsourced Clinical Lab Services",
                "name_es": "Servicios Integrales de Laboratorio Clínico",
                "keywords": r"servicio.{0,40}(laboratorio|analisis|estudios|pruebas)|estudios de laboratorio|\bSMI DE ELC\b|serv\.? laboratorio|banco de sangre",
            },
            {
                "code": "oil_well_services",
                "name_en": "Oil-well chemical treatments (Pemex)",
                "name_es": "Tratamientos químicos a pozos petroleros (Pemex)",
                "keywords": r"\bpozos?\b|petroler|nitrogeno|inducciones",
            },
            {
                "code": "biologics_vaccines",
                "name_en": "Biologics & Vaccines",
                "name_es": "Biológicos y Vacunas",
                "keywords": r"vacuna|biologicos?\b",
                "groups": ("020",),
            },
            {
                "code": "reagents_tests",
                "name_en": "Reagents & Diagnostic Tests",
                "name_es": "Reactivos y Pruebas de Diagnóstico",
                "keywords": r"reactivo|tiras? reactiva|prueba.{0,10}(rapida|diagnost|deteccion)|kit.{0,10}diagnost|\bPCR\b|antigeno",
            },
            {
                "code": "lab_equipment",
                "name_en": "Lab Equipment & its Maintenance",
                "name_es": "Equipo de Laboratorio y su Mantenimiento",
                "keywords": r"equipos?.{0,15}laboratorio|analizador|microscop|centrifug|espectrofotomet|cromatograf",
            },
            {
                "code": "lab_works",
                "name_en": "Lab Construction & Fit-out",
                "name_es": "Obra y Adecuación de Laboratorios",
                "keywords": r"adecuacion|construccion|remodelacion|\bobra\b",
            },
            {
                "code": "lab_materials",
                "name_en": "Lab Materials & Consumables",
                "name_es": "Material y Consumibles de Laboratorio",
                "keywords": r"material.{0,15}laboratorio|consumible|cristaleria|insumos.{0,15}laboratorio",
                "groups": ("080",),
                "partidas": ("255",),
            },
            {
                "code": "other_lab",
                "name_en": "Lab & diagnostics, type not stated",
                "name_es": "Laboratorio y diagnóstico sin tipo en el texto",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 69 — Seguros y Fianzas (added 2026-11-03). partidas: Clasificador por Objeto del Gasto
    # genéricas 344 «Seguros de responsabilidad patrimonial y fianzas» and 345 «Seguro de bienes
    # patrimoniales» (names in cucop_generica_map).
    # =========================================================================
    {
        "category_id": 69,
        "subcategories": [
            {
                "code": "catastrophe",
                "name_en": "Catastrophe & Natural-disaster Cover",
                "name_es": "Seguro Catastrófico y Desastres Naturales",
                "keywords": r"catastrof|fenomenos? naturales|parametrico|desastre",
            },
            {
                "code": "life_retirement",
                "name_en": "Life & Retirement Insurance",
                "name_es": "Seguros de Vida y Retiro",
                "keywords": r"seguro.{0,25}vida|vida institucional|colectivo de retiro|seguro.{0,15}separacion",
            },
            {
                "code": "medical_expenses",
                "name_en": "Medical-expenses Insurance",
                "name_es": "Seguros de Gastos Médicos",
                "keywords": r"gastos medicos|seguro.{0,25}(enfermedad|maternidad)",
            },
            {
                "code": "accident_school",
                "name_en": "Personal-accident & School Cover",
                "name_es": "Accidentes Personales y Escolares",
                "keywords": r"accidentes? (personal|escolar)|estudiantes|becarios|alumnos",
            },
            {
                "code": "vehicle_fleet",
                "name_en": "Vehicle Insurance",
                "name_es": "Seguro Vehicular",
                "keywords": r"vehic|automo|parque vehicular|flotilla|aeronave|embarcacion",
            },
            {
                "code": "liability_bonds",
                "name_en": "Liability & Surety Bonds",
                "name_es": "Responsabilidad Civil y Fianzas",
                "keywords": r"fianza|afianza|responsabilidad (civil|patrimonial)",
                "partidas": ("344",),
            },
            {
                "code": "property_damage",
                "name_en": "Property & Damage Insurance",
                "name_es": "Bienes Patrimoniales y Daños",
                "keywords": r"bienes patrimoniales|danos|incendio|poliza integral|aseguramiento.{0,30}bienes|todo (bien|riesgo)|plataforma",
                "partidas": ("345",),
            },
            {
                "code": "other_insurance",
                "name_en": "Insurance, type not stated",
                "name_es": "Seguros sin tipo en el texto",
                "keywords": r"",
                "is_catch_all": True,
            },
        ],
    },

    # =========================================================================
    # Cat 63 — Servicios de Limpieza (added 2026-11-03). partida genérica 359 «Servicios de
    # jardinería y fumigación» (cucop_generica_map). 358 «limpieza y manejo de desechos» mixes two
    # kinds, so it decides nothing.
    # =========================================================================
    {
        "category_id": 63,
        "subcategories": [
            {"code": "tanks_cisterns", "name_en": "Tank & Cistern Washing",
             "name_es": "Lavado de Cisternas y Tinacos", "keywords": r"cisterna|tinaco"},
            {"code": "laundry", "name_en": "Laundry & Hospital Linen",
             "name_es": "Lavandería y Ropa Hospitalaria",
             "keywords": r"lavanderia|lavado.{0,30}ropa|ropa (hospitalaria|quirurgica)"},
            {"code": "waste", "name_en": "Waste Collection & Disposal",
             "name_es": "Residuos y Desechos",
             "keywords": r"residuos|desechos|basura|recoleccion|rpbi|biologico.?infeccios"},
            {"code": "fumigation_gardening", "name_en": "Fumigation & Gardening",
             "name_es": "Fumigación y Jardinería",
             "keywords": r"fumigacion|plagas|jardineria|areas verdes|\bpoda\b", "partidas": ("359",)},
            {"code": "cleaning_supplies", "name_en": "Cleaning Supplies & Chemicals",
             "name_es": "Artículos y Químicos de Aseo",
             "keywords": r"(articulos|material(es)?|productos|quimicos|insumos) (y quimicos )?de (aseo|limpieza)|detergente|papel higienico"},
            {"code": "land_clearing", "name_en": "Land Clearing & Dredging",
             "name_es": "Limpieza de Terrenos y Desazolve",
             "keywords": r"terreno|desmonte|nivelacion|desazolve|maleza"},
            {"code": "building_cleaning", "name_en": "Building Cleaning Service",
             "name_es": "Limpieza de Inmuebles",
             "keywords": r"limpieza|aseo|higiene|desinfeccion|intendencia"},
            {"code": "other_cleaning", "name_en": "Cleaning, type not stated",
             "name_es": "Limpieza sin tipo en el texto", "keywords": r"", "is_catch_all": True},
        ],
    },

    # =========================================================================
    # Cat 34 — Servicios de TI (added 2026-11-03). Text only.
    # =========================================================================
    {
        "category_id": 34,
        "subcategories": [
            {"code": "managed_printing", "name_en": "Managed Printing & Scanning",
             "name_es": "Impresión y Digitalización Administrada",
             "keywords": r"fotocopiado|digitalizacion|impresion|sidyf"},
            {"code": "data_center_cloud", "name_en": "Data Centre & Cloud",
             "name_es": "Centro de Datos y Nube",
             "keywords": r"centro de datos|nube|computo empresarial|hospedaje|cloud|sadcon|hiperconverg|recuperacion de desastres|continuidad"},
            {"code": "licensing", "name_en": "Software Licensing",
             "name_es": "Licenciamiento",
             "keywords": r"licencia|microsoft|oracle|\bsap\b|suscripcion"},
            {"code": "networks_security", "name_en": "Networks & Cybersecurity",
             "name_es": "Redes y Ciberseguridad",
             "keywords": r"ciberseguridad|seguridad (informatica|de la informacion|perimetral)|firewall|\bredes?\b|conectividad|enlaces|\blan\b|\bwan\b"},
            {"code": "systems_development", "name_en": "Systems Development & Upkeep",
             "name_es": "Desarrollo y Mantenimiento de Sistemas",
             "keywords": r"desarrollo|fabrica de software|aplicativo|aplicaciones|sistemas? de informacion|software"},
            {"code": "support_endpoints", "name_en": "IT Support & End-user Computing",
             "name_es": "Soporte y Cómputo Personal",
             "keywords": r"mesa de (servicio|ayuda)|soporte|equipo de computo|computo personal|bienes informaticos|arrendamiento"},
            {"code": "other_it", "name_en": "IT services, type not stated",
             "name_es": "Servicios de TI sin tipo en el texto", "keywords": r"", "is_catch_all": True},
        ],
    },

    # =========================================================================
    # Cat 47 — Impresión y Publicaciones (added 2026-11-03). Text only.
    # =========================================================================
    {
        "category_id": 47,
        "subcategories": [
            {"code": "textbooks", "name_en": "Textbooks",
             "name_es": "Libros de Texto",
             "keywords": r"libros? de texto|gratuitos|conaliteg|ciclo escolar|telesecundaria|secundaria|primaria"},
            {"code": "managed_copying", "name_en": "Copying & Managed Printing",
             "name_es": "Fotocopiado e Impresión Administrada",
             "keywords": r"fotocopiado|digitalizacion|multifuncional|impresion.{0,20}administrad|administrado de impresion"},
            {"code": "security_forms", "name_en": "Security Forms & Documents",
             "name_es": "Formas Valoradas y Documentos de Seguridad",
             "keywords": r"formas valoradas|boletas|credencial|pasaporte|holograma|papel seguridad|impresos? de seguridad|cheques|actas"},
            {"code": "publications_promo", "name_en": "Publications & Outreach Material",
             "name_es": "Publicaciones y Material de Difusión",
             "keywords": r"publicacion|revista|folleto|cartel|difusion|promocion|propaganda|libros|programas? (para el|de) bienestar|modulos"},
            {"code": "other_printing", "name_en": "Printing, type not stated",
             "name_es": "Impresión sin tipo en el texto", "keywords": r"", "is_catch_all": True},
        ],
    },

    # =========================================================================
    # Cat 75 — Uniformes y Vestuario (added 2026-11-03). partidas genéricas 271 «Vestuario y
    # uniformes», 272 «Prendas de seguridad y protección personal», 283 «Prendas de protección para
    # seguridad pública y nacional» (cucop_generica_map).
    # =========================================================================
    {
        "category_id": 75,
        "subcategories": [
            {"code": "police_ballistic", "name_en": "Police & Ballistic Gear",
             "name_es": "Equipo Policial y Balístico",
             "keywords": r"antibala|balistic|blindaj|policial|tactic", "partidas": ("283",)},
            {"code": "laundry_rental", "name_en": "Garment Laundry & Rental",
             "name_es": "Lavado y Renta de Ropa",
             "keywords": r"lavado|planchado|lavanderia|renta.{0,20}ropa"},
            {"code": "protective_gear", "name_en": "Protective Equipment",
             "name_es": "Equipo de Protección Personal",
             "keywords": r"proteccion (personal|corporal)|seguridad industrial|dielectric|overol|\bepp\b", "partidas": ("272",)},
            {"code": "uniforms_workwear", "name_en": "Uniforms & Workwear",
             "name_es": "Uniformes y Ropa de Trabajo",
             "keywords": r"uniforme|vestuario|\bropa\b|camisola|pantalon|prendas|blancos", "partidas": ("271",)},
            {"code": "footwear", "name_en": "Footwear",
             "name_es": "Calzado", "keywords": r"calzado|zapato|\bbotas?\b|tenis"},
            {"code": "other_apparel", "name_en": "Apparel, type not stated",
             "name_es": "Vestuario sin tipo en el texto", "keywords": r"", "is_catch_all": True},
        ],
    },

]

# =============================================================================
# Database helpers
# =============================================================================

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS subcategory_definitions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES categories(id),
    code            VARCHAR(60) NOT NULL,
    name_en         VARCHAR(120) NOT NULL,
    name_es         VARCHAR(120) NOT NULL,
    keywords        TEXT,
    is_catch_all    INTEGER DEFAULT 0,
    display_order   INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, code)
);

CREATE TABLE IF NOT EXISTS subcategory_stats (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subcategory_id  INTEGER NOT NULL REFERENCES subcategory_definitions(id),
    category_id     INTEGER NOT NULL,
    total_contracts INTEGER DEFAULT 0,
    total_value     REAL    DEFAULT 0,
    avg_risk        REAL    DEFAULT 0,
    direct_award_pct REAL   DEFAULT 0,
    single_bid_pct  REAL    DEFAULT 0,
    year_min        INTEGER,
    year_max        INTEGER,
    top_vendor_name TEXT,
    top_vendor_id   INTEGER,
    example_titles  TEXT,
    pct_of_category REAL    DEFAULT 0,
    consolidated_value_pct REAL DEFAULT 0,
    computed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(subcategory_id)
);

CREATE INDEX IF NOT EXISTS idx_subcategory_defs_cat ON subcategory_definitions(category_id);
CREATE INDEX IF NOT EXISTS idx_subcategory_stats_cat ON subcategory_stats(category_id);
"""


def setup_schema(conn: sqlite3.Connection) -> None:
    for stmt in SCHEMA_SQL.split(";"):
        stmt = stmt.strip()
        if stmt:
            conn.execute(stmt)
    # additive: value share bought through a «compra consolidada» (2026-11-03)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(subcategory_stats)")}
    if "consolidated_value_pct" not in cols:
        conn.execute("ALTER TABLE subcategory_stats ADD COLUMN consolidated_value_pct REAL DEFAULT 0")
    # additive: share of contracts with a high or critical risk indicator (≥ 0.40), TEAL-4 2026-11-05
    if "high_risk_pct" not in cols:
        conn.execute("ALTER TABLE subcategory_stats ADD COLUMN high_risk_pct REAL")
    conn.commit()


def upsert_definitions(conn: sqlite3.Connection, defs: list[dict] | None = None) -> dict[str, int]:
    """Upsert SUBCATEGORY_DEFS keyed on (category_id, code) so ids stay stable across runs
    (contract_subcategory, subcategory_stats and subcategory_vendor_topn all point at them).
    Definitions no longer in the list are deleted with their stats/vendor rows.
    Returns {"category_id:code" → id}."""
    defs = SUBCATEGORY_DEFS if defs is None else defs
    want = {(b["category_id"], s["code"]) for b in defs for s in b["subcategories"]}
    for b in defs:
        for order, sub in enumerate(b["subcategories"]):
            conn.execute(
                """INSERT INTO subcategory_definitions
                   (category_id, code, name_en, name_es, keywords, is_catch_all, display_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(category_id, code) DO UPDATE SET
                     name_en = excluded.name_en, name_es = excluded.name_es, keywords = excluded.keywords,
                     is_catch_all = excluded.is_catch_all, display_order = excluded.display_order""",
                (b["category_id"], sub["code"], sub["name_en"], sub["name_es"], sub.get("keywords", ""),
                 1 if sub.get("is_catch_all") else 0, order),
            )
    stale = [i for i, c, code in conn.execute("SELECT id, category_id, code FROM subcategory_definitions")
             if (c, code) not in want]
    for i in stale:
        conn.execute("DELETE FROM subcategory_stats WHERE subcategory_id = ?", (i,))
        if conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'subcategory_vendor_topn'").fetchone():
            conn.execute("DELETE FROM subcategory_vendor_topn WHERE subcategory_id = ?", (i,))
        conn.execute("DELETE FROM subcategory_definitions WHERE id = ?", (i,))
    conn.commit()
    logger.info("Upserted %d subcategory definitions (%d stale removed)", len(want), len(stale))
    return {f"{c}:{code}": i for i, c, code in conn.execute("SELECT id, category_id, code FROM subcategory_definitions")}


# =============================================================================
# Computation
# =============================================================================

VENDOR_TOPN = 10  # vendors kept per subcategory (the dossier drill's «Los N mayores»)


_TRAILING_SUFFIX = re.compile(r"(\s+(DE C|DE R L|S DE R|DE|S|SA|C V|CV))+$")


def firm_keys(vendor_id: int, name: str | None, group_id: int | None, is_individual: int | None) -> tuple[str, ...]:
    """The keys that identify a firm for «Los N mayores»: its vendor group (vendors.group_id → vendor_groups) and
    its name without legal suffix (api.sanctions.normalize_name, plus suffixes cut short by a 60-character field:
    «… S.A. DE C.»). Two vendors sharing either key are one firm (merge_vendors). Personas físicas keep their own
    id: two people can share a name."""
    from api.persona_fisica import company_prob
    from api.sanctions import normalize_name
    # a stale is_individual on a firm («… S.A. DE C.», «OBRAS PORTUARIAS DE …») still merges: the name model decides
    if is_individual and company_prob(name or "") < 0.5:
        return (f"v:{vendor_id}",)
    n = _TRAILING_SUFFIX.sub("", normalize_name(name))
    keys = ([f"g:{group_id}"] if group_id else []) + ([f"n:{n}"] if n else [])
    return tuple(keys) or (f"v:{vendor_id}",)


# a procedure folio («LA-019GYR047-E53-2017», «CONSOLIDADO/INSABI/…/92») says nothing about what was bought
_FOLIO = re.compile(r"\b[A-Z]{2}-\d{2,3}[A-Z0-9]{3,}|\w+/\w+/")


def good_example(title: str | None) -> bool:
    """A «p. ej.» title must name the thing: no procedure folio, not a bare word."""
    t = (title or "").strip()
    return len(t) >= 15 and not _FOLIO.search(t.upper())


_ODD = re.compile(r"[^\w\s.,;:()/%'\"«»“”’°º&+#¿?¡!-]|[ÃÂ][-¿]")  # stray symbols, U+FFFD, mojibake


def cleanest_examples(titles: list[str], n: int = 5, kind: re.Pattern | None = None) -> list[str]:
    """The «p. ej.» shown first is the shortest readable title that names the kind (owner 2026-11-03): it must match
    the subcategory's own text rule (`kind`; a row placed by supply group or partida proves nothing in its title),
    no folio, no garbled text, not a bare word, few digits. Distinct once accents are stripped; shortest first."""
    seen, out = set(), []
    for t in sorted((" ".join(t.split()) for t in titles if good_example(t)), key=len):
        key = strip_accents(t.upper())
        digits = sum(ch.isdigit() for ch in t)
        if key in seen or len(t) < 20 or _ODD.search(t) or digits > 0.1 * len(t):
            continue
        if kind is not None and not kind.search(key):
            continue
        seen.add(key)
        out.append(t)
        if len(out) == n:
            break
    return out


def example_title(title: str, limit: int = 110) -> str:
    """A title for «p. ej.»: whole words only — cut at the last space before the limit, marked «…»."""
    t = " ".join(title.upper().split())
    if len(t) <= limit:
        return t
    return t[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-") + "…"


def merge_vendors(vendors: dict) -> list[dict]:
    """vendors: {vendor_id: {count, name, value, risk, keys}} → one row per firm (vendors linked by any shared key,
    union-find), sorted by value. The firm is shown as its largest member (id + name), so the chip opens the main
    dossier."""
    parent: dict[str, str] = {}

    def root(k: str) -> str:
        while parent.setdefault(k, k) != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    for vc in vendors.values():
        first = root(vc["keys"][0])
        for k in vc["keys"][1:]:
            parent[root(k)] = first
    firms: dict[str, dict] = {}
    for vid, vc in vendors.items():
        f = firms.setdefault(root(vc["keys"][0]), {"count": 0, "value": 0.0, "risk": 0.0, "best": None, "best_value": -1.0})
        f["count"] += vc["count"]
        f["value"] += vc["value"]
        f["risk"] += vc["risk"]
        if vc["value"] > f["best_value"]:
            f["best"], f["best_value"] = (vid, vc["name"]), vc["value"]
    out = [{"vendor_id": f["best"][0], "name": f["best"][1], "count": f["count"], "value": f["value"],
            "avg_risk": f["risk"] / f["count"] if f["count"] else None} for f in firms.values()]
    return sorted(out, key=lambda x: -x["value"])


def compute_stats(conn: sqlite3.Connection, id_map: dict[str, int]) -> tuple[list[tuple], list[tuple]]:
    """Aggregate the ids stored by classify_subcategories (contract_subcategory) — reads only.

    Returns (stat rows for subcategory_stats, vendor rows for subcategory_vendor_topn)."""
    cur = conn.cursor()
    all_rows: list[tuple] = []
    vendor_rows: list[tuple] = []
    # each subcategory's own text rule: its «p. ej.» must say the kind in words
    kinds = {id_map[f"{b['category_id']}:{sd['code']}"]: re.compile(sd["keywords"], re.IGNORECASE)
             for b in SUBCATEGORY_DEFS for sd in b["subcategories"]
             if sd.get("keywords") and f"{b['category_id']}:{sd['code']}" in id_map}
    if not cur.execute("SELECT 1 FROM sqlite_master WHERE name = 'contract_subcategory'").fetchone():
        raise SystemExit("contract_subcategory missing: run python -m scripts.classify_subcategories first")

    for cat_block in SUBCATEGORY_DEFS:
        cat_id = cat_block["category_id"]
        subs = cat_block["subcategories"]
        ids = {id_map[f"{cat_id}:{s['code']}"]: s for s in subs}
        accum = {i: {"contracts": 0, "value": 0.0, "cons_value": 0.0, "risk_sum": 0.0, "hr_sum": 0, "da_sum": 0, "sb_sum": 0,
                     "year_min": 9999, "year_max": 0, "vendors": {}, "examples": []} for i in ids}
        logger.info("Aggregating category_id=%d …", cat_id)
        for (sub_id, cons, title, amount, risk, da, sb, year, vid, vname, gid, indiv) in cur.execute("""
            SELECT cs.subcategory_id, cs.is_consolidated, c.title, COALESCE(c.amount_mxn, 0), COALESCE(c.risk_score, 0),
                   COALESCE(c.is_direct_award, 0), COALESCE(c.is_single_bid, 0), c.contract_year, c.vendor_id,
                   COALESCE(v.name, ''), v.group_id, v.is_individual
            FROM contracts c
            JOIN contract_subcategory cs ON cs.contract_id = c.id
            LEFT JOIN vendors v ON v.id = c.vendor_id
            WHERE c.category_id = ?
        """, (cat_id,)):
            acc = accum.get(sub_id)
            if acc is None:  # stored before a definition change — rerun classify_subcategories
                continue
            acc["contracts"] += 1
            acc["value"] += amount
            if cons:
                acc["cons_value"] += amount
            acc["risk_sum"] += risk
            acc["hr_sum"] += risk >= HIGH_RISK
            acc["da_sum"] += da
            acc["sb_sum"] += sb
            if year:
                acc["year_min"] = min(acc["year_min"], year)
                acc["year_max"] = max(acc["year_max"], year)
            if vid:
                vc = acc["vendors"].get(vid)
                if vc is None:
                    vc = acc["vendors"][vid] = {"count": 0, "name": vname, "value": 0.0, "risk": 0.0,
                                                "keys": firm_keys(vid, vname, gid, indiv)}
                vc["count"] += 1
                vc["value"] += amount
                vc["risk"] += risk
            kind = kinds.get(sub_id)
            if (title and len(title) <= 200 and good_example(title)
                    and (kind is None or kind.search(strip_accents(title.upper())))):  # candidates; the picker sorts
                ex = acc["examples"]
                ex.append(title)
                if len(ex) > 2000:  # bounded: keep the 400 shortest (the picker wants short ones)
                    ex.sort(key=len)
                    del ex[400:]

        cat_total = sum(a["value"] for a in accum.values())
        for sub_id, acc in accum.items():
            n = acc["contracts"]
            avg_risk = acc["risk_sum"] / n if n else 0.0
            da_pct = 100.0 * acc["da_sum"] / n if n else 0.0
            sb_pct = 100.0 * acc["sb_sum"] / n if n else 0.0
            firms = merge_vendors(acc["vendors"])
            top_by_count = max(firms, key=lambda f: f["count"]) if firms else None
            for rank, f in enumerate(firms[:VENDOR_TOPN], 1):
                vendor_rows.append((sub_id, rank, f["vendor_id"], f["name"][:200], f["count"], f["value"], f["avg_risk"]))
            all_rows.append((
                sub_id, cat_id, n, acc["value"], avg_risk, da_pct, sb_pct,
                acc["year_min"] if acc["year_min"] < 9999 else None,
                acc["year_max"] if acc["year_max"] > 0 else None,
                top_by_count["name"][:80] if top_by_count else None,
                top_by_count["vendor_id"] if top_by_count else None,
                json.dumps([example_title(t) for t in cleanest_examples(acc["examples"], 5, kinds.get(sub_id))]),
                (acc["value"] / cat_total * 100) if cat_total > 0 else 0.0,
                (acc["cons_value"] / acc["value"] * 100) if acc["value"] > 0 else 0.0,
                (100.0 * acc["hr_sum"] / n) if n else None,
            ))
        logger.info("  Built %d stat rows for category %d", len(subs), cat_id)

    return all_rows, vendor_rows


VENDOR_TOPN_SQL = """
CREATE TABLE subcategory_vendor_topn (
    subcategory_id  INTEGER NOT NULL,
    rank            INTEGER NOT NULL,
    vendor_id       INTEGER NOT NULL,
    vendor_name     TEXT    NOT NULL,
    contract_count  INTEGER NOT NULL,
    vendor_value    REAL    NOT NULL,
    avg_risk        REAL,
    PRIMARY KEY (subcategory_id, rank)
)"""


def write_vendor_topn(conn: sqlite3.Connection, rows: list[tuple]) -> None:
    """Replace subcategory_vendor_topn (top VENDOR_TOPN vendors by value per subcategory)."""
    conn.execute("DROP TABLE IF EXISTS subcategory_vendor_topn")
    conn.execute(VENDOR_TOPN_SQL)
    conn.executemany("INSERT INTO subcategory_vendor_topn VALUES (?,?,?,?,?,?,?)", rows)
    conn.commit()
    logger.info("Wrote %d rows to subcategory_vendor_topn", len(rows))


HIGH_RISK = 0.40  # «alto» threshold (frontend RISK_THRESHOLDS.high); alto + crítico


def update_high_risk(conn: sqlite3.Connection) -> int:
    """Fill subcategory_stats.high_risk_pct alone (one GROUP BY), without rebuilding the rest of the table."""
    setup_schema(conn)
    rows = conn.execute("""
        SELECT cs.subcategory_id, 100.0 * AVG(CASE WHEN c.risk_score >= ? THEN 1.0 ELSE 0.0 END)
        FROM contract_subcategory cs JOIN contracts c ON c.id = cs.contract_id
        GROUP BY cs.subcategory_id
    """, (HIGH_RISK,)).fetchall()
    with conn:
        conn.executemany("UPDATE subcategory_stats SET high_risk_pct = ? WHERE subcategory_id = ?", [(p, s) for s, p in rows])
    return len(rows)


def existing_id_map(conn: sqlite3.Connection) -> dict[str, int]:
    """{category_id:code -> id} from the definitions already in the DB (--vendors-only keeps them)."""
    return {f"{c}:{code}": i for i, c, code in conn.execute("SELECT id, category_id, code FROM subcategory_definitions")}


def write_stats(conn: sqlite3.Connection, rows: list[tuple]) -> None:
    """Replace subcategory_stats in one transaction."""
    logger.info("Writing %d rows to subcategory_stats …", len(rows))
    with conn:
        conn.execute("DELETE FROM subcategory_stats")
        conn.executemany("""
            INSERT INTO subcategory_stats
              (subcategory_id, category_id, total_contracts, total_value, avg_risk,
               direct_award_pct, single_bid_pct, year_min, year_max,
               top_vendor_name, top_vendor_id, example_titles, pct_of_category, consolidated_value_pct, high_risk_pct)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, rows)


# =============================================================================
# Entry point
# =============================================================================

def main() -> None:
    logger.info("Opening DB: %s", DB_PATH)
    conn = sqlite3.connect(str(DB_PATH), timeout=120)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=120000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.row_factory = sqlite3.Row

    logger.info("Setting up schema …")
    setup_schema(conn)

    logger.info("Upserting definitions …")
    id_map = upsert_definitions(conn)

    logger.info("Computing stats (read-only phase) …")
    stat_rows, vendor_rows = compute_stats(conn, id_map)

    logger.info("Writing stats (write phase) …")
    write_stats(conn, stat_rows)
    write_vendor_topn(conn, vendor_rows)

    # Summary
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM subcategory_stats WHERE total_contracts > 0")
    n_nonzero = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM subcategory_stats")
    n_total = cur.fetchone()[0]
    logger.info("Done. %d / %d subcategories have data.", n_nonzero, n_total)

    conn.close()


if __name__ == "__main__":
    import sys
    if "--high-risk-only" in sys.argv:
        conn4 = sqlite3.connect(str(DB_PATH), timeout=120)
        conn4.execute("PRAGMA busy_timeout=120000")
        logger.info("Updated high_risk_pct for %d subcategories", update_high_risk(conn4))
        conn4.close()
        sys.exit(0)
    if "--vendors-only" in sys.argv:
        # Only (re)build subcategory_vendor_topn against the definitions already in the DB;
        # subcategory_definitions / subcategory_stats stay untouched (ids unchanged).
        conn3 = sqlite3.connect(str(DB_PATH), timeout=120)
        conn3.execute("PRAGMA busy_timeout=120000")
        _, vrows = compute_stats(conn3, existing_id_map(conn3))
        write_vendor_topn(conn3, vrows)
        conn3.close()
    else:
        main()
