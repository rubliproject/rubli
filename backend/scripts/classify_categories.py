"""
Classify all 3.1M contracts into 70 spending categories using regex matching on titles.

Replaces the old 19 partida-based categories (9.1% coverage) with 70 regex-based
categories achieving ~85%+ coverage by matching Spanish-language contract titles.

Creates 70 new categories (IDs 20-89), deactivates old 1-19, and classifies contracts
in priority order (most specific first, catch-all last).

Run from backend/ directory:
    python -m scripts.classify_categories

After running, execute:
    python -m scripts.classify_subcategories     (per-contract subcategory ids)
    python -m scripts.compute_category_stats
or the whole chain: sh scripts/category_precompute_chain.sh <db>
"""

import re
import sqlite3
import time
import unicodedata
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "RUBLI_NORMALIZED.db"


def strip_accents(text: str) -> str:
    """Remove accents: ó→o, á→a, é→e, í→i, ú→u, ñ→n"""
    nfkd = unicodedata.normalize('NFD', text)
    return ''.join(c for c in nfkd if unicodedata.category(c) != 'Mn')


# =============================================================================
# 70 Categories: (id, code, name_en, name_es, sector_id, regex_keywords)
#
# Priority order: IDs 20-84 (specific), 85-88 (broad), 89 (catch-all)
# sector_id mapping: 1=salud, 2=educacion, 3=infraestructura, 4=energia,
#   5=defensa, 6=tecnologia, 7=hacienda, 8=gobernacion, 9=agricultura,
#   10=ambiente, 11=trabajo, 12=otros
#
# IMPORTANT: Patterns are tested in list order. More specific patterns must
# come before broader ones. Within a group, order matters.
# =============================================================================

CATEGORIES = [
    # ── Group 1: Healthcare & Pharma (IDs 20-25) ──
    # Very broad patterns because COMPRANET has many specific drug/supply names
    (20, "cat_medications", "Medications & Pharma", "Medicamentos y Farmaceuticos", 1,
     r"medicamento|farmac|vacuna|insulina|antibiot|analges|iopramida|omeprazol"
     r"|paracetamol|ibuprofeno|metformina|amoxicilina|ciprofloxacin|losartan"
     r"|captopril|diclofenac|ranitidina|naproxeno|ampicilina|cefalosporina"
     r"|bienes.{0,10}terapeutic|productos.{0,10}farmac|clorhidrato|solucion.{0,10}(inyect|oral)"
     r"|tableta|capsula|jarabe|suspension.{0,10}(oral|inyect)|ampolleta"
     r"|medicina.{0,5}(patente|generica)|oxigeno.{0,5}medic"),
    (21, "cat_medical_equipment", "Medical Equipment", "Equipo Medico", 1,
     r"equipo.{0,10}medic|instrumental quirurg|protesis|ortoped|rayos.?x|tomograf"
     r"|resonancia|electrocardiog|desfibrilad|esteriliz|autoclave|incubadora"
     r"|ventilador.{0,10}(medic|mecanico|pulmonar)|oximetro|monitor.{0,10}(pacient|signos)"
     r"|ultrasonido.{0,10}medic|endoscopio|equipo.{0,10}(dental|quirurg|radiolog|oftalmol)"
     r"|osteosintesis|marcapasos|instrumental.{0,5}medic|implante.{0,5}(oseo|cardiaco|coclear|titan)"
     r"|protesis.{0,5}(osea|articular|valvular)|endoprotesis|stent"),
    (22, "cat_medical_supplies", "Medical Supplies", "Material de Curacion", 1,
     r"material de curacion|materiales.{0,10}(medic|curacion|quirurg)|gasas|jeringas|cateter"
     r"|vendas|guantes.{0,5}(quirurg|latex|nitrilo)|sutura|aposito|sonda(?!.{0,5}(campeche|camepeche|marina))"  # «Sonda de Campeche» = Pemex offshore region (SILVER-8)
     r"|suministros medic|accesorios.{0,10}medic|insumos.{0,10}(medic|hospital)"
     r"|material.{0,10}(radiolog|dental|quirurg|laboratorio)"
     r"|mat\.\s*curacion|bienes.{0,10}consumo.{0,10}terapeutic|claves.{0,10}(gpo|sector salud)"
     r"|compra.{0,10}claves.{0,10}necesarias|aplicador.{0,10}madera"
     r"|compra consolidada.{0,10}med|adquisicion.{0,10}(claves|bienes terapeutic)"),
    (23, "cat_lab_diagnostics", "Lab & Diagnostics", "Laboratorio y Diagnostico", 1,
     r"laboratorio|reactivo|diagnost|analisis clinic|biolog|microbiolog"
     r"|prueba.{0,10}(rapid|diagnost|laborat)|hemoglobina|glucosa.{0,10}(tira|reactiv)"
     r"|cultivo.{0,10}(bacteriol|microb)|bioquimic|citolog"),
    (24, "cat_hospital_services", "Hospital Services", "Servicios Hospitalarios", 1,
     r"hospital|clinica|atencion medica|salud publica|ambulancia|hemodialisis"
     r"|cirugia|quirofano|terapia intensiva|anestesi|rehabilitacion.{0,10}(fisic|medic)"
     r"|dosimetria|banco de leche|servicio.{0,10}(medic|salud|hospital|dental|optometr)"
     r"|\bumae|expediente.{0,10}contratacion.{0,10}aa-"),
    (25, "cat_blood_transfusion", "Blood & Transfusion", "Sangre y Transfusion", 1,
     r"sangre|transfusion|hemoder|plasma|plaqueta"),

    # ── Group 2: Construction & Infrastructure (IDs 26-30) ──
    (26, "cat_building_construction", "Building Construction", "Construccion de Edificios", 3,
     r"construccion|edificio|obra civil|ciment|estructura metalica|obra publica"
     r"|cimentacion|obra.{0,10}(nueva|exterior|interior)|edificacion|demolicion"
     r"|acciones de vivienda|cuarto.{0,10}(dormir|ladero|adicional)"
     r"|concreto|acero|block|tabique|varilla|cimbra"),
    (27, "cat_road_highway", "Road & Highway", "Carreteras y Vias", 3,
     r"carretera|autopista|paviment|asfalto|puente vehic|camino rural|vialidad"
     r"|carpeta asfaltica|terraceria|guarnicion|banqueta|señalamiento.{0,10}(vial|carret)"
     r"|camino|calle|tramo|boulevard|glorieta|libramiento|entronque|puente"),
    (28, "cat_water_infrastructure", "Water Infrastructure", "Infraestructura Hidraulica", 3,
     r"agua potable|drenaje|alcantarillado|\bpresas?\b|acueducto|hidraulic|saneamiento"
     r"|red.{0,10}(agua|hidraulic|alcantarill)|toma.{0,10}(domiciliari|agua)|pozo.{0,10}(profund|agua)"
     r"|linea de conduccion|colector|carcamo"
     r"|\bpozos?\b(?!.{0,15}(petrol|gas|perfora|explora))|sistema.{0,10}agua|red.{0,10}agua|emisor|tanque.{0,10}agua"),
    (29, "cat_electrical_infrastructure", "Electrical Infrastructure", "Infraestructura Electrica", 4,
     r"linea de transmision|subestacion|electrificacion|red electrica|cableado electrico"
     r"|alumbrado publico|red.{0,10}distribucion.{0,10}electr"
     r"|postes|cable.{0,10}electri|alumbrado|luminaria.{0,10}public|transformador"),
    (30, "cat_maintenance_renovation", "Building Maintenance", "Mantenimiento de Inmuebles", 3,
     r"mantenimiento.{0,10}inmueble|remodelacion|impermeabiliz"
     r"|reparacion.{0,10}(edif|inmueble|instal)|adecuacion.{0,10}(espacio|oficina|area)"
     r"|trabajos de.{0,10}(adecuacion|remodelacion|adaptacion|acondicion)"),

    # ── Group 3: IT & Technology (IDs 31-36) ──
    (31, "cat_software_licenses", "Software & Licenses", "Software y Licencias", 6,
     r"software|licencia.{0,10}(uso|computo|informatica)|sistema informatico|programa de computo"
     r"|\bsap\b|oracle|microsoft|adobe|vmware|citrix|windows|linux|symantec|\bjava\b"
     r"|aplicacion.{0,10}(movil|web|informatica)|desarrollo.{0,10}(sistema|aplicacion|web)"),
    (32, "cat_hardware_computers", "Hardware & Computers", "Hardware y Computadoras", 6,
     r"computadora|\bservidor(es)?\b(?!.{0,3}public)|laptop|\bmonitor(es)?\b|impresora|escaner|disco duro|\bups\b|equipo.{0,10}computo"
     r"|tablet|\bipad|desktop|workstation|switch.{0,10}(red|cisco)|router|access point"
     r"|no.?break|regulador.{0,10}voltaje|memoria.{0,10}(ram|usb)"),
    (33, "cat_telecom_networks", "Telecom & Networks", "Telecomunicaciones y Redes", 6,
     r"telecomunicacion|red de datos|internet|fibra optica|conmutador|antena|satelit"
     r"|telefoni|enlace.{0,10}(datos|dedicado|internet)|banda ancha|radiocomunicacion"
     r"|videoconferencia|linea.{0,10}telefon"),
    (34, "cat_it_services", "IT Services & Consulting", "Servicios de TI", 6,
     r"servicio.{0,15}(informatica|tecnolog|computo|digital)|soporte tecnico|help desk|mesa de ayuda"
     r"|servicio.{0,10}(correo electronico|almacenamiento|respaldo|base de datos)"
     r"|hosting|data center|centro de datos|\bnube\b|cloud|ciberseguridad|seguridad informatica"),
    # Merged 35 (cybersecurity) and 36 (cloud) into 34 since they are small

    # ── Group 4: Energy & Fuels (IDs 37-40) ──
    (37, "cat_fuels_lubricants", "Fuels & Lubricants", "Combustibles y Lubricantes", 4,
     r"combustible|gasolina|diesel|lubricante|petroleo|aceite.{0,5}motor|gas lp|gas natural"
     r"|\bmagna\b|turbosina|queroseno|aceite.{0,10}(hidraulic|transmision)"),
    (38, "cat_electricity_services", "Electricity Services", "Servicios de Electricidad", 4,
     r"energia electrica|suministro.{0,10}electric|consumo.{0,10}electric|tarifa electrica"),
    (39, "cat_renewable_energy", "Renewable Energy", "Energia Renovable", 4,
     r"energia.{0,5}(solar|eolica|renovable)|panel solar|celda fotovoltaica|biogas"),
    (40, "cat_oil_gas", "Oil & Gas Operations", "Operaciones Petroleras", 4,
     r"perforacion|\bductos?\b|refinacion|plataforma petrolera|petroquimic|crudo|pozo.{0,10}(petrol|gas)"
     r"|oleoducto|gasoducto|proceso.{0,10}(refinacion|destilacion)|catalizador"),

    # ── Group 5: Transport & Vehicles (IDs 41-44) ──
    (41, "cat_vehicles_fleet", "Vehicles & Fleet", "Vehiculos y Flotilla", 12,
     r"vehiculo|automovil|camioneta|autobus|motocicleta|flotilla|patrulla"
     r"|camion.{0,5}($|\s)|pick.?up|sedan|minivan|tractocamion"),
    (42, "cat_airline_tickets", "Airline Tickets", "Boletos de Avion", 12,
     r"boleto.{0,10}avion|boletos? a.?reos?|boletaje|pasajes? a.?reos?|pasajes de transpo|radicacion de pasajes|vuelo|transporte aereo|aerolinea|viaje aereo"
     r"|transportacion aerea"),
    (43, "cat_freight_logistics", "Freight & Logistics", "Fletes y Logistica", 12,
     r"flete|transporte de carga|mudanza|logistic|paqueteria|mensajeria"
     r"|envio.{0,10}(document|paquet|correspon)|guia.{0,10}(prepagada|envio)"),
    (44, "cat_vehicle_maintenance", "Vehicle Maintenance", "Mantenimiento Vehicular", 12,
     r"mantenimiento vehic|taller mecanico|refaccion|llanta|neumatic|afinacion"
     r"|verificacion vehic|hojalateria|pintura.{0,10}vehicul|servicio.{0,10}(automotriz|vehicul)"),

    # ── Group 6: Office & Administration (IDs 45-48) ──
    (45, "cat_office_supplies", "Office Supplies", "Papeleria y Oficina", 12,
     r"papeleria|material de oficina|papel.{0,5}(bond|carta|oficio|copiadora)|toner|cartucho"
     r"|engargolado|folder|sobre.{0,5}(manila|carta)|grapas|\bclips?\b|boligrafo"
     r"|pluma|lapiz|marcador|cinta.{0,10}(adhesiv|canela)|corrector|post.?it"
     r"|articulos de oficina|consumibles.{0,10}(oficin|impres)"
     r"|^papel$|papel\s"),
    (46, "cat_furniture", "Furniture & Fixtures", "Mobiliario", 12,
     r"mobiliario|escritorio|silla.{0,10}(oficina|ejecut|secretar)|archivero|estanteria|locker"
     r"|mueble.{0,10}oficina|librero|credenza|mesa.{0,10}(trabajo|juntas|conferencia)"),
    (47, "cat_printing_publications", "Printing & Publications", "Impresion y Publicaciones", 12,
     r"impresion|publicacion|editorial|libro|revista|diario oficial|folleto|cartel"
     r"|litografia|serigrafia|rotulacion|encuadernacion|fotocopiado"),
    (48, "cat_stationery_forms", "Forms & Credentials", "Formatos y Formas", 12,
     r"formato.{0,10}(oficial|impres)|forma.{0,10}oficial|credencial|gafete|holograma"
     r"|tarjeta.{0,10}(identificacion|acceso)|placa.{0,10}(metalica|identif)"),

    # ── Group 7: Professional Services (IDs 49-53) ──
    (49, "cat_legal_services", "Legal Services", "Servicios Juridicos", 12,
     r"juridic|legal|abogado|notari|litigio|asesoria legal|defensa legal"
     r"|escrituracion|representacion legal|perito.{0,10}(legal|judicial)"),
    (50, "cat_accounting_audit", "Accounting & Audit", "Contabilidad y Auditoria", 7,
     r"contab|audit|fiscal|dictamen|despacho contable|estados financiero"
     r"|revision.{0,10}(contable|financier|fiscal)"),
    (51, "cat_consulting", "Consulting & Advisory", "Consultoria", 12,
     r"consultoria|asesoria|estudio de mercado|diagnostico.{0,10}(organ|instit)"
     r"|evaluacion.{0,10}(programa|proyecto|desempeno|politica)"),
    (52, "cat_architecture_engineering", "Architecture & Engineering", "Arquitectura e Ingenieria", 3,
     r"arquitect|proyecto ejecutivo|topograf|estudio de suelo|supervision de obra"
     r"|estudio.{0,10}(factibilidad|geotecn|mecanica de suelo)|dictamen.{0,10}estructural"
     r"|plano|levantamiento.{0,10}(topograf|arquitecton)"),
    (53, "cat_research_studies", "Research & Studies", "Investigacion y Estudios", 12,
     r"investigacion|encuesta|analisis estadist|censo|diagnostico ambiental"
     r"|estudio.{0,10}(impacto|costo.?beneficio|viabilidad)"),

    # ── Group 8: Training & Events (IDs 54-56) ──
    (54, "cat_training", "Training & Courses", "Capacitacion y Cursos", 12,
     r"capacitacion|\bcursos?\b|taller.{0,10}(formacion|capacit)|diplomado|certificacion|seminario"
     r"|adiestramiento|entrenamiento|formacion.{0,10}(profesional|continua)"),
    (55, "cat_events_conferences", "Events & Conferences", "Eventos y Conferencias", 12,
     r"evento|congreso|conferencia|convencion|\bforos?\b|simposio|ceremonia"
     r"|exposicion|inauguracion|conmemoracion"),
    (56, "cat_advertising_media", "Advertising & Media", "Publicidad y Medios", 8,
     r"publicidad|campana.{0,10}(difusion|comunicacion)|medios de comunicacion|\bspots?\b|propaganda"
     r"|difusion|inserciones|monitoreo de medios|produccion.{0,10}(audiovisual|video|spot)"
     r"|promocional"),

    # ── Group 9: Food & Catering (IDs 57-59) ── MASSIVELY broadened
    (57, "cat_food_provisions", "Food & Provisions", "Alimentos y Viveres", 12,
     # Generic food terms
     r"alimento|vivere|despensa|canasta basica|productos? alimenticios?|comestible|abarrote"
     # Specific food staples (LICONSA/DICONSA products are huge in COMPRANET)
     r"|harina|galleta|leche|azucar|arroz|frijol|\batun\b|cafe.{0,5}(soluble|tostado|molido)"
     r"|aceite.{0,10}(comestible|vegetal|cocina)|\bsal\b.{0,5}(molida|refinada|yodada)"
     r"|chocolate.{0,5}(polvo|tablilla)|avena|cereal|\bmiel\b|mermelada|mayonesa"
     r"|pasta.{0,10}(sopa|alimenticia)|\bsopas?\b|sardina|lenteja|garbanzo|chile"
     r"|salsa|vinagre|mostaza|catsup|concentrado.{0,10}(liquido|pollo|tomate|res)"
     r"|tortilla|\bpan\b.{0,5}(blanco|dulce|molde|integral|caja)|huevo|queso|jamon"
     r"|salchicha|pollo|carne|\bres\b|cerdo|pescado|filete|chorizo|tocino"
     r"|fruta|verdura|naranja|manzana|platano|limon|tomate|\bpapas?\b|cebolla|zanahoria"
     r"|lechuga|jitomate|calabaza|chayote|nopal|pepino|aguacate"
     r"|\bjugos?\b|refresco|yogurt|\bcremas?\b|mantequilla|margarina|suero"
     r"|gelatina|\bflan(es)?\b|postre|helado|nieve|paleta"
     r"|\bnuez\b|cacahuate|almendra|pistache|semilla.{0,5}(girasol|calabaza)"
     r"|\bsoya\b|proteina|suplemento alimenticio"
     # DICONSA/LICONSA product names (very common in COMPRANET)
     r"|consome|atole|\bmoles?\b|manteca vegetal|cerillos|veladora|dulces"
     r"|caramelo|maiz blanco|maiz amarillo|formula lactea|panales"
     r"|mercancias generales|maquila"
     # Additional food products
     r"|pimienta|canela|oregano|comino|ajonjoli|champi|aceituna"
     r"|chicharron|carnita|barbacoa|tamale|empanada|\btacos?\b|enchilada"
     r"|chocolate.{0,5}mesa|chocolate.{0,5}liquido|\bsal\b|\bsal\b.{0,5}(grano|marina|campo)"
     r"|granola|granos.{0,5}(granel|envasado|basico)|polvo.{0,5}hornear|salvado"
     r"|alim.{0,10}(infantil|colado|picado)|alimentos.{0,5}(infantil|bebe)"
     r"|diversos.{0,5}vegetales|vegetales.{0,5}envasados"),
    (58, "cat_catering_meals", "Catering & Meals", "Servicio de Alimentacion", 12,
     r"alimentacion|comedor|cocina|\braciones?\b|desayuno|box lunch|banquete|catering"
     r"|servicio.{0,10}(aliment|comida|comedor|cocina)|dieta|\bmenus?\b"),
    (59, "cat_water_beverages", "Water & Beverages", "Agua y Bebidas", 12,
     r"agua purificada|garrafon|agua embotellada|bebida|cafe.{0,10}(oficina|servicio)"),

    # ── Group 10: Security & Surveillance (IDs 60-62) ──
    (60, "cat_private_security", "Private Security", "Vigilancia y Seguridad", 5,
     r"vigilancia|seguridad privada|guardia|custod|monitoreo.{0,10}seguridad|alarma"
     r"|proteccion.{0,10}(civil|fisica|persona)|servicio.{0,10}(vigilancia|custod)"),
    (61, "cat_surveillance_equipment", "Surveillance Equipment", "Equipo de Vigilancia", 5,
     r"camara.{0,10}(seguridad|vigilancia|cctv)|circuito cerrado|\bdomos?\b|detector|arco.{0,10}seguridad"
     r"|rayos.?x.{0,10}(seguridad|equipaje)|control de acceso"),
    (62, "cat_arms_defense", "Arms & Defense", "Armamento y Defensa", 5,
     r"armamento|municion|chaleco antibalas|arma.{0,10}(fuego|corta|larga)|equipo tactico|blindaje"
     r"|cartuchos.{0,10}(calibre|mm)"),

    # ── Group 11: Cleaning & Waste (IDs 63-65) ── MASSIVELY broadened
    (63, "cat_cleaning_services", "Cleaning Services", "Servicios de Limpieza", 12,
     r"limpieza|\baseo\b|higiene|desinfeccion|fumigacion|sanitiz|lavanderia"
     r"|servicio.{0,10}(limpieza|aseo|higiene|jardineria)"),
    (64, "cat_cleaning_supplies", "Cleaning Supplies", "Material de Limpieza", 12,
     # Generic cleaning terms
     r"material de limpieza|detergente|jabon|cloro|desinfectante|papel higienico|toalla"
     # Specific cleaning products (very common in COMPRANET)
     r"|blanqueador|limpiador|shampoo|champu|suavizante|aromatizante|ambientador"
     r"|escoba|trapeador|fibra.{0,10}(verde|limpieza)|jerga|franela|cubeta|recogedor"
     r"|atomizador|guantes.{0,10}(limpieza|latex|domestico)|bolsa.{0,10}(basura|plastica)"
     r"|insecticida|raticida|gel.{0,10}(antibacterial|sanitizante)"
     r"|pastilla.{0,10}(sanitizante|desodorante|urinario)"
     r"|servilleta|panuelo.{0,5}desechable|navajas.{0,5}afeitar|rastrillo.{0,5}afeitar"
     r"|desodorante.{0,5}(personal|uso|axila)|higiene.{0,5}personal"),
    (65, "cat_waste_management", "Waste Management", "Manejo de Residuos", 10,
     r"residuo|basura|desecho|reciclaje|recoleccion.{0,10}basura|confinamiento|residuo peligroso"),

    # ── Group 12: Real Estate & Leasing (IDs 66-68) ──
    (66, "cat_property_rental", "Property Rental", "Arrendamiento de Inmuebles", 12,
     r"arrendamiento.{0,10}inmueble|renta.{0,10}(oficina|edificio|bodega|local)|alquiler"
     r"|arrendamiento.{0,10}(edificio|terreno|bodega|local|oficina)"),
    (67, "cat_equipment_rental", "Equipment Rental", "Arrendamiento de Equipo", 12,
     r"arrendamiento.{0,10}(equipo|maquinaria|vehiculo)|renta.{0,10}(equipo|maquinaria|copiadora)"
     r"|leasing"),
    (68, "cat_real_estate_services", "Real Estate Services", "Servicios Inmobiliarios", 12,
     r"avaluo|peritaje|\bvaluacion|administracion de inmueble"),

    # ── Group 13: Insurance & Financial (IDs 69-71) ──
    (69, "cat_insurance", "Insurance & Bonds", "Seguros y Fianzas", 7,
     r"seguro(?!.{0,3}social)|fianza|poliza|prima.{0,10}seguro|cobertura|siniestro|aseguradora"),
    (70, "cat_financial_services", "Financial Services", "Servicios Financieros", 7,
     r"servicio financiero|credito|prestamo|banca|tesoreria|pago electronico|dispersi"
     r"|vale.{0,10}(despensa|gasolina|efectivo)|tarjeta.{0,10}(electronica|monedero|prepago)"
     r"|vales"),
    (71, "cat_pensions_benefits", "Pensions & Benefits", "Pensiones y Prestaciones", 11,
     r"pension|jubilacion|prestaciones?.{0,5}(social|economic|laboral|contractual)|fondo de ahorro|seguro de vida|aguinaldo"),

    # ── Group 14: Environmental (IDs 72-74) ──
    (72, "cat_environmental_services", "Environmental Services", "Servicios Ambientales", 10,
     r"ambiental|impacto ambiental|ecologic|reforestacion|conservacion|manejo forestal"),
    (73, "cat_water_treatment", "Water Treatment", "Tratamiento de Agua", 10,
     r"tratamiento de agua|planta tratadora|potabiliz|desaliniz|cloracion"),
    (74, "cat_air_quality", "Air Quality & Monitoring", "Calidad del Aire", 10,
     r"calidad del aire|monitoreo ambiental|contaminacion|emisiones|estacion.{0,10}monitoreo"),

    # ── Group 15: Uniforms & Clothing (IDs 75-76) ──
    (75, "cat_uniforms", "Uniforms & Clothing", "Uniformes y Vestuario", 12,
     r"uniforme|vestuario|ropa.{0,10}(trabajo|proteccion)|calzado|botas|overol|\bbatas?\b"
     r"|zapato|playera|chamarra|chaleco.{0,5}($|\s|s)"
     r"|\bropa\b|prendas|vestimenta|pantalon"),
    (76, "cat_textiles", "Textiles & Fabrics", "Textiles y Telas", 12,
     r"textil|\btelas?\b|blancos|cobija|sabana|colchon|cortina|alfombra|colcha|almohada|edredon|roperia"),

    # ── Group 16: Travel & Per Diem (IDs 77-78) ──
    (77, "cat_lodging", "Lodging & Hotels", "Hospedaje y Hoteles", 12,
     r"hospedaje|hotel|alojamiento|habitacion|estancia(?!s?.{0,3}infantil)|pernocta"),
    (78, "cat_travel_services", "Travel Services", "Servicios de Viaje", 12,
     r"agencia de viaje|viatico|pasaporte|\bvisas?\b|traslado|transporte de personal"),

    # ── Group 17: Electrical & Hardware (IDs 79-81) ──
    (79, "cat_electrical_materials", "Electrical Materials", "Material Electrico", 12,
     r"material electrico|cable.{0,10}(electr|cobre|utp|red)|contacto.{0,10}electr"
     r"|interruptor|transformador|luminaria|\bfocos?\b|\bled\b|lampara|apagador"
     r"|centro de carga|tablero.{0,10}(electr|distribucion)"
     r"|pilas?\b|baterias?\b|linterna|apartarrayos|cuchilla.{0,5}desconect"
     r"|cable.{0,5}(control|media tension|alta tension|baja tension)|\bcables\b"),
    (80, "cat_plumbing", "Plumbing & Hydraulic", "Plomeria e Hidraulico", 12,
     r"plomeria|tuberia|valvula|bomba de agua|tinaco|cisterna|sanitario|lavabo"
     r"|regadera|llave.{0,10}(agua|paso)|mingitorio|inodoro"),
    (81, "cat_tools_hardware", "Tools & Hardware", "Herramientas y Ferreteria", 12,
     r"herramienta|ferreteria|taladro|soldadura|pintura|brocha|tornillo|cerrajeria"
     r"|desarmador|llave.{0,10}(mecanica|allen|stilson)|sierra|cinta metrica"
     r"|herraje|albanileria|plomeria.{0,5}(ferret|herram)|utensilios.{0,5}(lamina|galvaniz|metal|cocina)"
     r"|cuchilla(?!.{0,5}desconect)|\blamina\b|candado|bisagra|jaladera|cerradura"),

    # ── Group 18: Education & Culture (IDs 82-84) ──
    (82, "cat_textbooks_education", "Textbooks & Education", "Libros de Texto y Educacion", 2,
     r"libro de texto|material didactico|educativo|escolar|\bbecas?\b|utiles escolares"
     r"|cuaderno|mochila|uniforme escolar"),
    (83, "cat_cultural_sports", "Cultural & Sports", "Cultura y Deportes", 12,
     r"cultural|museo|teatro|deporte|gimnasio|cancha|parque|recreativ"
     r"|medalla|trofeo|balon|pelota"),
    (84, "cat_scientific_equipment", "Scientific Equipment", "Equipo Cientifico", 12,
     r"equipo cientifico|microscopio|centrifuga|espectro|cromatograf|equipo de laboratorio"),

    # ── Group 19: Chemical & Industrial Supplies (ID 93) ──
    (93, "cat_chemical_supplies", "Chemical Supplies", "Sustancias Quimicas", 12,
     r"sustancias quimicas|quimic|reactivo quimic|solvente|acido.{0,5}(clor|sulfur|nitric)"
     r"|alcohol.{0,3}($|\s)|etanol|metanol|hipoclorito|peroxido|formaldehido"),

    # ── Broad catch categories (IDs 85-88) ── MASSIVELY broadened
    (85, "cat_agricultural", "Agricultural Supplies", "Insumos Agropecuarios", 9,
     r"agropecuario|fertilizante|semilla.{0,5}(para|siembra|agricol)|ganado|veterinar|forraje"
     r"|agroindustria|riego|parcela|invernadero|tractor"
     r"|ejecucion de las lineas de accion|extension(ismo|ista)|capacitacion rural"),
    (86, "cat_machinery", "Machinery & Equipment", "Maquinaria y Equipo", 12,
     r"maquinaria|equipo pesado|retroexcavadora|\bgruas?\b|compactadora|generador electrico"
     r"|equipo.{0,10}(industrial|especializado)"),
    (87, "cat_photo_audiovisual", "Photography & Audiovisual", "Fotografia y Audiovisual", 12,
     r"fotograf|video|audiovisual|grabacion|camara.{0,10}(fotografica|de video)|microf|proyector"),

    # ── Super-broad service/material/maintenance catch-alls ──
    # These match the remaining 184K "servicio", 141K "material", 84K "mantenimiento"
    # titles that didn't match any specific category above

    (88, "cat_maintenance_general", "General Maintenance", "Mantenimiento General", 12,
     # Catches all remaining "mantenimiento" that didn't match vehicles, buildings, etc.
     r"mantenimiento|manten|reparacion|conservacion|rehabilitacion|restauracion"),

    (90, "cat_materials_supplies", "Materials & Supplies", "Materiales y Suministros", 12,
     # Catches "material", "adquisicion de", "suministro de" generic patterns
     r"material(?!.{0,10}(medic|curacion|quirurg|limpiez|electr|oficin|didact|radiolog))"
     r"|suministro|adquisicion|abastecimiento|dotacion"),

    (91, "cat_general_services", "General Services", "Servicios Generales", 12,
     # Catches remaining "servicio" titles not matched by specific categories
     r"servicio.{0,15}(administr|auxiliar|apoyo|complement|ordinario|tecnico)"
     r"|trabajo.{0,5}(tecnico|especializ|profesional|comisionado)"
     r"|trabajos.{0,5}(tecnicos|especializados|comisionados)"
     r"|servicio|contratacion|subrogado|outsourcing|tercerizado"
     r"|prestador.{0,10}servicio|honorario"
     r"|\bobras?\b|proyecto|programa|instalacion|acondicionamiento"
     # Generic procurement terms
     r"|contrato|pedido|convenio|compra|orden.{0,10}(compra|servicio|trabajo)"
     r"|licitacion|concurso|invitacion"),

    (92, "cat_equipment_general", "General Equipment", "Equipo General", 12,
     # Catches remaining "equipo" titles
     r"equipo.{0,10}(especial|complement|accesorio|diverso)|herramienta"
     r"|equipo|instrumento|aparato|dispositivo|accesorio"
     r"|articulo|\bbien(es)?\b|producto|insumo|consumible|implemento"),

    # ── Catch-all (ID 89) ──
    (89, "cat_other", "Other / Unclassified", "Otros / Sin Clasificar", 12, None),
]


# Priority: specific (20-87, 93) first, then the broad catch-alls 88 → 90 → 91 → 92, then 89.
BROAD_IDS = (88, 90, 91, 92)

# Sector-based fallback: if no pattern matches, use sector context
# Only contracts with sector_id=12 (otros) remain as truly unclassified
SECTOR_FALLBACK_CATEGORY = {
    1: 22,   # salud → Medical Supplies (IMSS/ISSSTE unclassified = likely medical)
    2: 82,   # educacion → Textbooks & Education
    3: 88,   # infraestructura → General Maintenance
    4: 86,   # energia → Machinery & Equipment
    5: 92,   # defensa → General Equipment
    6: 34,   # tecnologia → IT Services
    7: 91,   # hacienda → General Services
    8: 91,   # gobernacion → General Services
    9: 85,   # agricultura → Agricultural Supplies
    10: 72,  # ambiente → Environmental Services
    11: 91,  # trabajo → General Services
    12: 89,  # otros → Other/Unclassified (genuinely unknown)
}

SPECIFIC_PATTERNS = [(c[0], re.compile(c[5], re.IGNORECASE)) for c in CATEGORIES
                     if c[5] is not None and c[0] not in BROAD_IDS]
BROAD_PATTERNS = [(cid, re.compile(c[5], re.IGNORECASE)) for cid in BROAD_IDS
                  for c in CATEGORIES if c[0] == cid]

# APP/PPS concessions with bare-folio titles (DC17APP0071 ... -APP) are works, not
# goods (docs/CATEGORY_AUDIT_2026-10-22.md). Only rescues rows that would hit the
# sector fallback: road concessions keep 27, APP services (testigo social, bases)
# keep their broad match, and supervision/analysis of an APP is not the works.
APP_CONCESSION = re.compile(
    r"dc\d{2}app|\bapp[- ]?\d|\bapp\s*$|\bpps\b|asociacion publico.{0,5}privad")
APP_NOT_WORKS = re.compile(r"supervis|analisis")
# A description that supplies or installs goods: a «capacitación» inside it is the vendor's hand-over
# training, not a training contract. Applies to the description-rescue pass only; a title that says
# «curso» / «capacitación» still wins in the first pass.
SUPPLY_BUNDLE = re.compile(r"suministro|instalacion|puesta en (operacion|marcha)|pruebas de arranque")
# Category 42 is passenger tickets. `vuelo` / `transporte aereo` also hit the aircraft themselves: radar
# «plan de vuelo», helicopter «horas de vuelo», trainer simulators, air cargo, aircraft leasing (PLUM 2026-11-05).
AIRFARE = 42
NOT_TICKETS = re.compile(
    r"radar|plan de vuelo|horas? de vuelo|simulador|manten|mantto|soporte|\bsop\b|logistic|\bcarga\b"
    r"|helicop|\bhelis?\b|arrendamiento|aeronave|ala (fija|rotativa)|refaccion|turbosina|combustible|rpas|\bdron"
    r"|\btren\b|control de acceso|traslado.{0,4}pacientes")
# Ground-only ticketing («boletos terrestre»): `boletaje` / `pasajes` with no air word (RED 2026-11-05).
_AIR = re.compile(r"a.?reo|a.?rea|avion|vuelo|aerolinea")


def _not_ticket(text):
    return bool(NOT_TICKETS.search(text)) or ("terrestre" in text and not _AIR.search(text))


def classify_text(title, description, sector_id):
    """Return (category_id, source) for one contract; source is 'regex' or 'fallback'.

    Two-pass strategy: a specific pattern on the TITLE wins first; only if no
    specific category matches the title do we re-try the specific patterns over
    title+description (the description-rescue lever for structure-C/D contracts
    whose title is a bare folio). Broad catch-alls apply last, on the title only,
    so a stray "servicio" in a description can never demote a good title match.
    """
    title_lower = strip_accents((title or "").lower())
    for cat_id, pattern in SPECIFIC_PATTERNS:
        if cat_id == AIRFARE and _not_ticket(title_lower):
            continue
        if pattern.search(title_lower):
            return cat_id, "regex"
    if description:
        combined = strip_accents((((title or "") + " ") + description).lower())
        bundled = SUPPLY_BUNDLE.search(combined)
        for cat_id, pattern in SPECIFIC_PATTERNS:
            if cat_id == 54 and bundled:
                continue  # training delivered with a supply is part of the supply (IMSS/TERMO PAILERIA 2026-10-30)
            if cat_id == AIRFARE and _not_ticket(combined):
                continue
            if pattern.search(combined):
                return cat_id, "regex"
    for cat_id, pattern in BROAD_PATTERNS:
        if pattern.search(title_lower):
            return cat_id, "regex"
    if APP_CONCESSION.search(title_lower) and not APP_NOT_WORKS.search(title_lower):
        return 26, "regex"
    fallback = SECTOR_FALLBACK_CATEGORY.get(sector_id, 89) if sector_id else 89
    return fallback, ("fallback" if fallback != 89 else "regex")


def classify_contracts(db_path=DB_PATH):
    print("=" * 60)
    print("SPENDING CATEGORY CLASSIFICATION (regex categories)")
    print("=" * 60)

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA busy_timeout = 60000")
    conn.execute("PRAGMA synchronous = OFF")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA cache_size = -200000")  # 200MB cache
    cur = conn.cursor()

    # --- Step 1: Deactivate old categories 1-19 ---
    print("\n1. Deactivating old categories (IDs 1-19)...")
    cur.execute("UPDATE categories SET is_active = 0 WHERE id <= 19")
    print(f"   Deactivated {cur.rowcount} old categories")

    # --- Step 2: Insert new categories 20-92 ---
    print("\n2. Inserting new categories...")

    # Delete existing entries in new range to allow re-runs
    cur.execute("DELETE FROM categories WHERE id >= 20")

    for cat_id, code, name_en, name_es, sector_id, keywords in CATEGORIES:
        cur.execute("""
            INSERT INTO categories (id, code, name_en, name_es, sector_id, keywords, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
        """, (cat_id, code, name_en, name_es, sector_id, keywords))

    conn.commit()
    print(f"   Inserted {len(CATEGORIES)} categories")

    # --- Step 3: provenance column (fallback rows are what cucop_classify may override) ---
    cols = {r[1] for r in cur.execute("PRAGMA table_info(contracts)")}
    if "category_source" not in cols:
        cur.execute("ALTER TABLE contracts ADD COLUMN category_source TEXT")
    print(f"\n3. {len(SPECIFIC_PATTERNS)} specific + {len(BROAD_PATTERNS)} broad patterns "
          f"(ID 89 is catch-all)")

    # --- Step 4: Classify all contracts ---
    print("\n4. Classifying contracts...")
    t0 = time.time()

    # Fetch contract IDs, titles, descriptions, and sector_ids.
    # Include rows that have a description even when the title is blank (bare-folio rows).
    cur.execute("""SELECT id, title, description, sector_id FROM contracts
                   WHERE (title IS NOT NULL AND title != '')
                      OR (description IS NOT NULL AND description != '')""")
    contracts = cur.fetchall()
    total = len(contracts)
    print(f"   Loaded {total:,} contracts with a title and/or description")

    # Classify in batches
    BATCH_SIZE = 50_000
    category_counts = {}
    unclassified = 0
    sector_fallback_count = 0
    batch = []

    for idx, (contract_id, title, description, sector_id) in enumerate(contracts):
        matched_cat, source = classify_text(title, description, sector_id)
        if source == "fallback":
            sector_fallback_count += 1
        if matched_cat == 89:
            unclassified += 1

        category_counts[matched_cat] = category_counts.get(matched_cat, 0) + 1
        batch.append((matched_cat, source, contract_id))

        if len(batch) >= BATCH_SIZE:
            cur.executemany("UPDATE contracts SET category_id = ?, category_source = ? WHERE id = ?", batch)
            conn.commit()
            elapsed = time.time() - t0
            rate = (idx + 1) / elapsed if elapsed > 0 else 0
            print(f"   Processed {idx + 1:,} / {total:,} ({rate:,.0f}/sec)")
            batch = []

    # Final batch
    if batch:
        cur.executemany("UPDATE contracts SET category_id = ?, category_source = ? WHERE id = ?", batch)
        conn.commit()

    # For contracts without titles, apply sector fallback (or 89 for sector 12/null)
    cur.execute("""
        UPDATE contracts SET category_id = CASE sector_id
            WHEN 1 THEN 22
            WHEN 2 THEN 82
            WHEN 3 THEN 88
            WHEN 4 THEN 86
            WHEN 5 THEN 92
            WHEN 6 THEN 34
            WHEN 7 THEN 91
            WHEN 8 THEN 91
            WHEN 9 THEN 85
            WHEN 10 THEN 72
            WHEN 11 THEN 91
            ELSE 89
        END,
        category_source = CASE WHEN sector_id BETWEEN 1 AND 11 THEN 'fallback' ELSE 'regex' END
        WHERE (title IS NULL OR title = '')
          AND (description IS NULL OR description = '')
    """)
    no_title = cur.rowcount
    conn.commit()

    elapsed = time.time() - t0
    print(f"\n   Classification complete in {elapsed:.1f}s ({total / elapsed:,.0f} contracts/sec)")
    print(f"   Sector fallback applied: {sector_fallback_count:,} contracts")

    # --- Step 5: Print summary ---
    print(f"\n{'='*60}")
    print("CLASSIFICATION RESULTS")
    print(f"{'='*60}")

    classified = total - unclassified
    coverage = 100.0 * classified / total if total > 0 else 0
    print(f"  Total contracts:    {total:>12,}")
    print(f"  Classified:         {classified:>12,} ({coverage:.1f}%)")
    print(f"  Unclassified:       {unclassified:>12,} ({100 - coverage:.1f}%)")
    print(f"  No title (-> other):{no_title:>12,}")

    # Top 25 categories by count
    print(f"\n  Top 25 Categories")
    print(f"  {'-'*55}")
    sorted_cats = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)
    cat_names = {c[0]: c[3] for c in CATEGORIES}  # id -> name_es

    for rank, (cat_id, count) in enumerate(sorted_cats[:25], 1):
        pct = 100.0 * count / total
        name = cat_names.get(cat_id, "?")
        print(f"  {rank:>3}. {name:<35} {count:>10,} ({pct:>5.1f}%)")

    # Check no single catch-all > 15%
    other_count = category_counts.get(89, 0)
    other_pct = 100.0 * other_count / total if total > 0 else 0
    print(f"\n  Catch-all (ID 89): {other_count:,} ({other_pct:.1f}%)")
    if other_pct > 15:
        print("  WARNING: Unclassified exceeds 15% target -- consider adding more patterns")
    else:
        print("  OK: Unclassified is within 15% target")

    if coverage >= 85:
        print(f"  OK: Coverage {coverage:.1f}% meets 85% target")
    elif coverage >= 80:
        print(f"  ACCEPTABLE: Coverage {coverage:.1f}% close to 85% target")
    else:
        print(f"  WARNING: Coverage {coverage:.1f}% below 85% target")

    print(f"{'='*60}")
    conn.close()


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DB_PATH), help="database to classify (default: RUBLI_NORMALIZED.db)")
    classify_contracts(ap.parse_args().db)
