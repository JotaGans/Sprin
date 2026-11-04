import sqlite3

def sincronizar_procesos_y_plantillas(conn: sqlite3.Connection, admin_id: int):
    c = conn.cursor()

    # 1. ACTUALIZACIÓN Y SINCERAMIENTO DEL CATÁLOGO DE PROCESOS INSTITUCIONALES
    procesos_a_sincronizar = [
        # Procesos Estratégicos E1, E2, E3
        ("E1", "Dirección y gestión estratégica", 0, None),
        ("E1.1", "Gestión de la dirección", 1, "E1"),
        ("E1.2", "Planeamiento estratégico institucional (PEI)", 1, "E1"),
        ("E1.3", "Planeamiento operativo institucional (POI)", 1, "E1"),
        ("E2", "Gestión de la modernización y mejora institucional", 0, None),
        ("E2.1", "Modernización institucional y gestión por procesos", 1, "E2"),
        ("E2.1.1", "Gestión del diseño organizacional", 2, "E2.1"),
        ("E2.1.2", "Gestión por procesos y simplificación administrativa", 2, "E2.1"),
        ("E2.1.3", "Estandarización y formulación de documentos normativos", 2, "E2.1"),
        ("E2.2", "Gestión del Sistema de Gestión Integrado (SGI)", 1, "E2"),
        ("E2.2.1", "Gestión del Sistema de Gestión de la Calidad (ISO 9001)", 2, "E2.2"),
        ("E2.2.2", "Gestión del Sistema de Gestión Antisoborno (ISO 37001)", 2, "E2.2"),
        ("E2.2.9", "Auditorías internas y externas del SGI", 2, "E2.2"),
        ("E3", "Control de la gestión institucional", 0, None),
        ("E3.1", "Implementación y evaluación del Sistema de Control Interno (SCI)", 1, "E3"),
        ("E3.2", "Seguimiento de servicios de control gubernamental (OCI y CGR)", 1, "E3"),
        ("E3.3", "Implementación del modelo de integridad y lucha contra la corrupción", 1, "E3"),
        ("E4", "Gestión de comunicaciones, imagen institucional y relaciones interinstitucionales", 0, None),
        ("E4.3", "Gestión de convenios y cooperación técnica", 1, "E4"),
        ("E5", "Gestión de gobierno digital y tecnologías de la información", 0, None),
        ("E5.1", "Desarrollo y mantenimiento de sistemas de información", 1, "E5"),

        # Procesos de Soporte S2 (Abastecimiento, Patrimonio e Infraestructura)
        ("S2", "Gestión de la logística e infraestructura", 0, None),
        ("S2.1", "Programación multianual de bienes, servicios y obras (PMBSO - CMN y PAC)", 1, "S2"),
        ("S2.2", "Gestión de adquisiciones y contrataciones públicas", 1, "S2"),
        ("S2.2.1", "Licitación pública y concurso público", 2, "S2.2"),
        ("S2.2.2", "Licitación abreviada y concurso abreviado", 2, "S2.2"),
        ("S2.2.3", "Contrataciones menores a 8 UIT", 2, "S2.2"),
        ("S2.2.4", "Subasta inversa electrónica y comparación de precios", 2, "S2.2"),
        ("S2.2.6", "Administración y ejecución contractual", 2, "S2.2"),
        ("S2.3", "Administración de bienes muebles y almacén", 1, "S2"),
        ("S2.3.1", "Almacenamiento, recepción e internamiento de bienes", 2, "S2.3"),
        ("S2.3.2", "Distribución y despacho a sedes desconcentradas", 2, "S2.3"),
        ("S2.3.3", "Inventario físico de existencias de almacén", 2, "S2.3"),
        ("S2.3.4", "Gestión patrimonial: alta, codificación y asignación", 2, "S2.3"),
        ("S2.3.5", "Gestión patrimonial: baja y disposición final (RAEE y otros)", 2, "S2.3"),
        ("S2.3.6", "Inventario físico anual de bienes patrimoniales", 2, "S2.3"),
        ("S2.3.7", "Planificación y contratación del aseguramiento de bienes", 2, "S2.3"),
        ("S2.4", "Gestión de servicios generales y mantenimiento", 1, "S2"),
        ("S2.4.1", "Mantenimiento preventivo y correctivo de la flota vehicular", 2, "S2.4"),
        ("S2.4.2", "Mantenimiento de infraestructura física, instalaciones y servicios generales", 2, "S2.4"),
        ("S2.5", "Gestión de infraestructura pública y obras (UEI)", 1, "S2"),
        ("S2.5.1", "Elaboración y aprobación de expedientes técnicos y documentos equivalentes", 2, "S2.5"),
        ("S2.5.2", "Ejecución física, supervisión de obra y control en INFOBRAS", 2, "S2.5"),
        ("S2.5.3", "Liquidación técnica-financiera, cierre y transferencia (Formato 09)", 2, "S2.5"),

        # Procesos de Soporte S3 (Gestión Financiera, Presupuestal, Tesorería e Inversiones)
        ("S3", "Gestión financiera, presupuestal y de inversiones", 0, None),
        ("S3.1", "Gestión del presupuesto público", 1, "S3"),
        ("S3.1.1", "Programación multianual presupuestaria y formulación del presupuesto", 2, "S3.1"),
        ("S3.1.2", "Aprobación y desagregación del PIA", 2, "S3.1"),
        ("S3.1.3", "Gestión de modificaciones presupuestarias", 2, "S3.1"),
        ("S3.1.4", "Certificaciones de crédito presupuestario (CCP) y previsiones", 2, "S3.1"),
        ("S3.1.5", "Evaluación semestral y anual de la ejecución presupuestaria", 2, "S3.1"),
        ("S3.2", "Gestión de tesorería y endeudamiento público", 1, "S3"),
        ("S3.2.1", "Determinación, recaudación y depósito de fondos públicos (TUSNE y otros)", 2, "S3.2"),
        ("S3.2.2", "Control previo y formalización del gasto devengado", 2, "S3.2"),
        ("S3.2.3", "Programación de calendario de pago y giros electrónicos CUT", 2, "S3.2"),
        ("S3.2.4", "Apertura, ejecución, rendición y reembolso de caja chica", 2, "S3.2"),
        ("S3.2.5", "Gestión de pasivos financieros, servicio de deuda y endeudamiento", 2, "S3.2"),
        ("S3.3", "Gestión contable institucional", 1, "S3"),
        ("S3.3.1", "Registro sistemático de operaciones y conciliaciones contables mensuales", 2, "S3.3"),
        ("S3.3.2", "Elaboración de estados financieros, presupuestarios y Cuenta General de la República", 2, "S3.3"),
        ("S3.4", "Gestión de inversiones públicas (Unidad Formuladora)", 1, "S3"),
        ("S3.4.1", "Diagnóstico institucional de brechas y criterios de priorización (UF)", 2, "S3.4"),
        ("S3.4.2", "Identificación y registro de ideas de proyectos (Formato 05-A)", 2, "S3.4"),
        ("S3.4.3", "Identificación y registro de ideas de IOARR (Formato 05-B)", 2, "S3.4"),
        ("S3.4.4", "Formulación, evaluación y viabilidad de proyectos CTI (Formato 07-A)", 2, "S3.4"),
        ("S3.4.5", "Identificación, sustento técnico y aprobación de IOARR (Formato 07-C)", 2, "S3.4"),
        ("S3.4.6", "Evaluación de consistencia técnica del ET (Formato 08 Sección A)", 2, "S3.4")
    ]

    for cod, nom, niv, padre in procesos_a_sincronizar:
        c.execute("""
            INSERT INTO procesos_institucionales (codigo, nombre, nivel, codigo_padre, estado)
            VALUES (?, ?, ?, ?, 'ACTIVO')
            ON CONFLICT(codigo) DO UPDATE SET 
                nombre = excluded.nombre, 
                nivel = excluded.nivel, 
                codigo_padre = excluded.codigo_padre,
                estado = 'ACTIVO'
        """, (cod, nom, niv, padre))

    # 2. INYECCIÓN CONSOLIDADA DE LAS 48 PLANTILLAS NORMATIVAS OFICIALES
    plantillas_consolidadas = [
        # --- BLOQUE S2: ABASTECIMIENTO, LOGÍSTICA E INFRAESTRUCTURA ---
        (
            "Programación Multianual de Bienes, Servicios y Obras (Fase de Identificación del CMN)",
            "Programación multianual de bienes, servicios y obras (S2.1)",
            "Determinación inicial y valorización de necesidades institucionales para el periodo trianual en el SIGA-MEF.",
            [
                ("1", "FASE 1: ACTOS PREVIOS Y DIFUSIÓN DE LINEAMIENTOS", 7, ""),
                ("1.1", "Emisión y difusión interna de cronograma y pautas institucionales de programación", 3, ""),
                ("1.2", "Habilitación de centros de costos y catálogo institucional de bienes, servicios y obras en SIGA", 4, "1.1"),
                ("2", "FASE 2: FORMULACIÓN Y REGISTRO DE NECESIDADES POR ÁREAS USUARIAS", 15, "1"),
                ("2.1", "Levantamiento de requerimientos analíticos por actividades operativas del POI Multianual", 5, "1.2"),
                ("2.2", "Registro de requerimientos de bienes y servicios en el módulo de programación SIGA-MEF", 6, "2.1"),
                ("2.3", "Revisión técnica, verificación de catálogos y consistencia con estándares sectoriales", 4, "2.2"),
                ("3", "FASE 3: CONSOLIDACIÓN Y EMISIÓN DEL PRODUCTO DE IDENTIFICACIÓN", 8, "2"),
                ("3.1", "Consolidación institucional de requerimientos valorizados por genérica y fuente de financiamiento", 4, "2.3"),
                ("3.2", "Generación del Anexo N° 01 de la Directiva de PMBSO y suscripción por la jefatura de abastecimiento", 2, "3.1"),
                ("3.3", "Remisión oficial del CMN Fase de Identificación a la OPPM para la Asignación Presupuestaria Multianual", 2, "3.2")
            ]
        ),
        (
            "Consolidación, Aprobación y Modificación del Cuadro Multianual de Necesidades (CMN)",
            "Programación multianual de bienes, servicios y obras (S2.1)",
            "Ajuste del CMN con el PIA, emisión del Anexo N° 02, aprobación formal y gestión periódica de modificaciones.",
            [
                ("1", "FASE 1: CONSOLIDACIÓN FINAL Y AJUSTE AL PIA", 8, ""),
                ("1.1", "Carga y conciliación del Marco Presupuestal Institucional de Apertura en el SIGA-MEF", 3, ""),
                ("1.2", "Ajuste de metas y cantidades priorizadas según techos presupuestales aprobados", 5, "1.1"),
                ("2", "FASE 2: FORMALIZACIÓN Y PUBLICACIÓN DEL CMN APROBADO", 7, "1"),
                ("2.1", "Generación del Anexo N° 02 (CMN Aprobado) y suscripción del informe técnico sustentatorio", 3, "1.2"),
                ("2.2", "Emisión del acto resolutivo de aprobación por la Oficina de Administración (dentro de 15 días hábiles del PIA)", 2, "2.1"),
                ("2.3", "Publicación del CMN aprobado en el portal web institucional (plazo máximo de 5 días hábiles)", 2, "2.2"),
                ("3", "FASE 3: GESTIÓN DE MODIFICACIONES MENSUALES AL CMN", 9, "2"),
                ("3.1", "Recepción y evaluación de solicitudes de inclusión o exclusión fundamentadas por áreas usuarias", 3, "2.3"),
                ("3.2", "Verificación de disponibilidad presupuestal y registro de modificación en el aplicativo SIGA", 3, "3.1"),
                ("3.3", "Elaboración del Anexo N° 04 y suscripción de resolución de modificación mensual de la OGA", 3, "3.2")
            ]
        ),
        (
            "Elaboración, Aprobación y Seguimiento del Plan Anual de Contrataciones (PAC)",
            "Programación multianual de bienes, servicios y obras (S2.1)",
            "Determinación de procedimientos de selección a convocar sobre la base del CMN, aprobación y control en Pladicop.",
            [
                ("1", "FASE 1: DETERMINACIÓN DE PROCEDIMIENTOS DE SELECCIÓN", 7, ""),
                ("1.1", "Extracción y ordenamiento de necesidades mayores al umbral legal desde el CMN aprobado", 3, ""),
                ("1.2", "Codificación de ítems según Catálogo Único de Bienes, Servicios y Obras (CUBSO) y determinación de tipos de proceso", 4, "1.1"),
                ("2", "FASE 2: FORMALIZACIÓN Y PUBLICACIÓN DEL PAC", 7, "1"),
                ("2.1", "Elaboración del proyecto de documento PAC y sustentación de cronogramas estimados de convocatoria", 3, "1.2"),
                ("2.2", "Emisión de resolución de aprobación del PAC por la Oficina General de Administración", 2, "2.1"),
                ("2.3", "Registro y publicación del PAC en la plataforma digital SEACE/Pladicop y portal web institucional", 2, "2.2"),
                ("3", "FASE 3: MONITOREO Y EVALUACIÓN TRIMESTRAL DEL PAC", 10, "2"),
                ("3.1", "Consolidación de procedimientos convocados, desiertos y pendientes en meses de corte (abril, julio, octubre)", 4, "2.3"),
                ("3.2", "Medición de los cinco indicadores de eficacia y oportunidad fijados por el ente rector de contrataciones", 3, "3.1"),
                ("3.3", "Emisión del informe trimestral de evaluación de la gestión de compras y notificación a Gerencia General", 3, "3.2")
            ]
        ),
        (
            "Licitación Pública / Concurso Público de Bienes, Servicios y Obras",
            "Gestión de adquisiciones y contrataciones públicas (S2.2)",
            "Procedimiento competitivo completo bajo la Ley General de Contrataciones Públicas desde actos preparatorios hasta el contrato.",
            [
                ("1", "FASE 1: ACTUACIONES PREPARATORIAS", 24, ""),
                ("1.1", "Recepción y revisión técnica del requerimiento con Términos de Referencia o Especificaciones Técnicas", 3, ""),
                ("1.2", "Estrategia de contratación e indagación o consulta en el mercado", 10, "1.1"),
                ("1.2.1", "Publicación de solicitud de cotización y recepción de cotizaciones de proveedores", 5, "1.1"),
                ("1.2.2", "Análisis de precios de mercado, estructura de costos y cálculo del valor estimado o referencial", 3, "1.2.1"),
                ("1.2.3", "Elaboración de la matriz de gestión de riesgos e informe de análisis de mercado", 2, "1.2.2"),
                ("1.3", "Solicitud y expedición de Certificación de Crédito Presupuestario (CCP) o previsión presupuestal", 3, "1.2.3"),
                ("1.4", "Conformación del expediente de contratación y aprobación por la Oficina de Administración", 3, "1.3"),
                ("1.5", "Designación e instalación del Comité de Selección u Oficial de Contratación", 2, "1.4"),
                ("1.6", "Elaboración y aprobación de bases administrativas estándar conforme a directivas rectoras", 3, "1.5"),
                ("2", "FASE 2: PROCEDIMIENTO DE SELECCIÓN", 34, "1"),
                ("2.1", "Convocatoria y publicación oficial del procedimiento en la plataforma digital SEACE/Pladicop", 1, "1.6"),
                ("2.2", "Registro de participantes y formulación de consultas y observaciones por los postores", 10, "2.1"),
                ("2.3", "Absolución de consultas y observaciones e integración final de bases administrativas", 5, "2.2"),
                ("2.4", "Presentación electrónica de ofertas a través de la plataforma oficial", 7, "2.3"),
                ("2.5", "Apertura, admisión, evaluación técnica y económica y calificación de ofertas recibidas", 6, "2.4"),
                ("2.6", "Otorgamiento de la buena pro y publicación del acta correspondiente en el sistema", 1, "2.5"),
                ("2.7", "Consentimiento de la buena pro conforme al plazo normativo de impugnación", 4, "2.6"),
                ("3", "FASE 3: PERFECCIONAMIENTO CONTRACTUAL", 13, "2"),
                ("3.1", "Presentación de requisitos para suscripción contractual por el postor ganador (garantías, CCI, colegiatura)", 6, "2.7"),
                ("3.2", "Verificación y subsanación documentaria por el Órgano Encargado de las Contrataciones", 4, "3.1"),
                ("3.3", "Suscripción formal del contrato o emisión de orden y registro en la plataforma digital", 3, "3.2")
            ]
        ),
        (
            "Licitación Abreviada y Concurso Abreviado",
            "Gestión de adquisiciones y contrataciones públicas (S2.2)",
            "Procedimiento simplificado de selección con plazos reducidos para adquisiciones de menor escala económica.",
            [
                ("1", "FASE 1: ACTOS PREPARATORIOS SIMPLIFICADOS", 16, ""),
                ("1.1", "Evaluación del requerimiento técnico remitido por el área usuaria del IMARPE", 2, ""),
                ("1.2", "Indagación de mercado rápida, consolidación de valor estimado y gestión de riesgos", 7, "1.1"),
                ("1.3", "Obtención de Certificación de Crédito Presupuestario (CCP) en el sistema financiero", 2, "1.2"),
                ("1.4", "Aprobación del expediente de contratación y designación del responsable de selección", 2, "1.3"),
                ("1.5", "Elaboración y aprobación de bases administrativas del procedimiento abreviado", 3, "1.4"),
                ("2", "FASE 2: ETAPA DE SELECCIÓN Y ADJUDICACIÓN", 18, "1"),
                ("2.1", "Convocatoria y publicación de bases del proceso en SEACE/Pladicop", 1, "1.5"),
                ("2.2", "Registro de participantes y formulación consolidada de consultas u observaciones", 5, "2.1"),
                ("2.3", "Absolución de consultas, integración de bases y cierre para ofertas", 3, "2.2"),
                ("2.4", "Presentación electrónica de propuestas en la plataforma oficial", 4, "2.3"),
                ("2.5", "Admisión, evaluación técnica-económica, calificación y adjudicación de buena pro", 3, "2.4"),
                ("2.6", "Consentimiento administrativo de la buena pro otorgada", 2, "2.5"),
                ("3", "FASE 3: PERFECCIONAMIENTO DEL VÍNCULO CONTRACTUAL", 9, "2"),
                ("3.1", "Recepción de documentos para perfeccionamiento del contrato por el postor adjudicado", 4, "2.6"),
                ("3.2", "Control de legalidad de garantías de fiel cumplimiento e idoneidad de requisitos", 3, "3.1"),
                ("3.3", "Firma del contrato o emisión de la orden de compra/servicio respectiva", 2, "3.2")
            ]
        ),
        (
            "Comparación de Precios y Subasta Inversa Electrónica",
            "Gestión de adquisiciones y contrataciones públicas (S2.2)",
            "Mecanismos estandarizados y no complejos para bienes con ficha técnica o bienes de disponibilidad inmediata.",
            [
                ("1", "FASE 1: PREPARACIÓN Y VALIDACIÓN TÉCNICA", 9, ""),
                ("1.1", "Validación de ficha técnica aprobada (Subasta Inversa) o verificación de estándar comercial (Comparación)", 2, ""),
                ("1.2", "Comprobación de condiciones de mercado y obtención de tres cotizaciones idénticas (para Comparación de Precios)", 4, "1.1"),
                ("1.3", "Certificación presupuestal y aprobación expedita del expediente de contratación", 3, "1.2"),
                ("2", "FASE 2: CONVOCATORIA Y PUJA / EVALUACIÓN", 9, "1"),
                ("2.1", "Convocatoria del proceso en la plataforma oficial con reglas simplificadas", 1, "1.3"),
                ("2.2", "Acreditación de participantes y periodo de presentación de posturas", 5, "2.1"),
                ("2.3", "Desarrollo del lance electrónico de precios (Subasta Inversa) o cotejo directo documental (Comparación)", 2, "2.2"),
                ("2.4", "Otorgamiento y consentimiento inmediato de la buena pro", 1, "2.3"),
                ("3", "FASE 3: FORMALIZACIÓN CONTRACTUAL", 5, "2"),
                ("3.1", "Presentación de documentación obligatoria y carta fianza o solicitud de retención", 3, "2.4"),
                ("3.2", "Generación y notificación de orden de compra o suscripción de contrato", 2, "3.1")
            ]
        ),
        (
            "Contratación Menor a 8 UIT (Compras Menores no Sujetas a Procedimiento)",
            "Gestión de adquisiciones y contrataciones públicas (S2.2)",
            "Gestión ágil para compras directas menores al tope de exclusión de la normativa general de contrataciones.",
            [
                ("1", "FASE 1: VERIFICACIÓN DEL REQUERIMIENTO Y RECURSOS", 4, ""),
                ("1.1", "Recepción de pedido SIGA debidamente justificado con TDR o especificación técnica", 1, ""),
                ("1.2", "Verificación de inclusión en CMN y no fraccionamiento de la contratación", 1, "1.1"),
                ("1.3", "Emisión de Certificado de Crédito Presupuestario (CCP) en el sistema financiero", 2, "1.2"),
                ("2", "FASE 2: SELECCIÓN DEL PROVEEDOR Y ASIGNACIÓN", 5, "1"),
                ("2.1", "Solicitud y cotejo de cotizaciones de proveedores con Registro Nacional de Proveedores (RNP) vigente", 3, "1.3"),
                ("2.2", "Verificación de impedimentos legales de contratación con el Estado y cuadro comparativo", 1, "2.1"),
                ("2.3", "Selección de la propuesta que optimiza calidad, precio y plazo de entrega", 1, "2.2"),
                ("3", "FASE 3: EMISIÓN, NOTIFICACIÓN Y REGISTRO", 3, "2"),
                ("3.1", "Generación de la orden de compra u orden de servicio en el aplicativo SIGA/SIAF", 1, "2.3"),
                ("3.2", "Notificación formal de la orden al contratista aceptante", 1, "3.1"),
                ("3.3", "Publicación obligatoria de la orden en el buscador oficial de contrataciones (Pladicop)", 1, "3.2")
            ]
        ),
        (
            "Ejecución Contractual, Modificaciones Contractuales y Liquidación",
            "Gestión de adquisiciones y contrataciones públicas (S2.2)",
            "Administración del contrato de bienes, consultorías o servicios, adendas, penalidades y conformidad final.",
            [
                ("1", "FASE 1: CONTROL INICIAL Y GESTIÓN DE RIESGOS CONTRACTUALES", 7, ""),
                ("1.1", "Revisión de plan de trabajo o cronograma de entrega presentado por el contratista", 4, ""),
                ("1.2", "Registro y custodia de garantías financieras de fiel cumplimiento y adelantos", 3, "1.1"),
                ("2", "FASE 2: TRÁMITE DE MODIFICACIONES CONTRACTUALES (DE PRESENTARSE)", 11, "1"),
                ("2.1", "Evaluación técnica de solicitudes de ampliación de plazo, adicional o reducción formulada", 4, "1.2"),
                ("2.2", "Informe legal y verificación presupuestal para modificaciones con incremento de costo", 4, "2.1"),
                ("2.3", "Emisión de resolución de aprobación de modificación y suscripción de adenda contractual", 3, "2.2"),
                ("3", "FASE 3: RECEPCIÓN, CONFORMIDAD Y LIQUIDACIÓN", 17, "2"),
                ("3.1", "Entrega material de bienes en almacén o presentación de informes/entregables de servicios", 2, "2.3"),
                ("3.2", "Verificación funcional y técnica detallada a cargo del área usuaria requirente", 5, "3.1"),
                ("3.3", "Emisión del acta de conformidad técnica o formulación de pliego de observaciones", 3, "3.2"),
                ("3.4", "Cálculo y aplicación de penalidades por mora u otras penalidades contractuales", 2, "3.3"),
                ("3.5", "Elaboración de la liquidación del contrato, devolución de retenciones o cartas fianza y constancia", 5, "3.4")
            ]
        ),
        (
            "Almacenamiento, Recepción e Internamiento de Bienes Muebles",
            "Administración de bienes muebles y almacén (S2.3)",
            "Ingreso formal de bienes al almacén central del IMARPE, control técnico, registro NEA y ubicación en stock.",
            [
                ("1", "FASE 1: RECEPCIÓN Y VERIFICACIÓN PRELIMINAR", 3, ""),
                ("1.1", "Descarga de bienes e inspección de empaques, guías de remisión y comprobantes del transportista", 1, ""),
                ("1.2", "Cotejo físico contra las especificaciones técnicas de la orden de compra en zona de recepción", 2, "1.1"),
                ("2", "FASE 2: CONFORMIDAD TÉCNICA E INTERNAMIENTO", 4, "1"),
                ("2.1", "Convocatoria al área usuaria o especialista técnico para emisión del acta de verificación técnica", 2, "1.2"),
                ("2.2", "Generación de la Nota de Entrada al Almacén (NEA) en el aplicativo SIGA-MEF y firma de conformidad", 2, "2.1"),
                ("3", "FASE 3: CUSTODIA, ROTULADO Y REGISTRO EN KARDEX", 4, "2"),
                ("3.1", "Acondicionamiento físico, clasificación y estiba en estanterías o cámaras de frío según naturaleza", 2, "2.2"),
                ("3.2", "Actualización del kardex valorizado y actualización de tarjetas de control visible (Bincards)", 2, "3.1")
            ]
        ),
        (
            "Distribución, Despacho y Transporte de Bienes a Sedes Desconcentradas",
            "Administración de bienes muebles y almacén (S2.3)",
            "Atención de requerimientos institucionales, generación de PECOSA, embalaje y traslado a laboratorios costeros.",
            [
                ("1", "FASE 1: TRÁMITE DEL PEDIDO DE SUMINISTRO", 3, ""),
                ("1.1", "Recepción y validación de pedidos de insumos/materiales registrados por áreas usuarias en SIGA", 1, ""),
                ("1.2", "Autorización presupuestal y verificación de existencia física de stock en almacén central", 2, "1.1"),
                ("2", "FASE 2: PREPARACIÓN Y DESPACHO DE BIENES", 4, "1"),
                ("2.1", "Emisión formal del Pedido-Comprobante de Salida (PECOSA) debidamente suscrito", 1, "1.2"),
                ("2.2", "Picking, embalaje y acondicionamiento seguro de materiales, reactivos y muestras", 2, "2.1"),
                ("2.3", "Generación de guías de remisión institucionales y entrega al transportista o conductor", 1, "2.2"),
                ("3", "FASE 3: TRASLADO, ENTREGA Y CONCILIACIÓN FINAL", 5, "2"),
                ("3.1", "Transporte logístico hacia los laboratorios costeros (Paita, Santa Rosa, Chimbote, Huacho, Pisco, Ilo)", 3, "2.3"),
                ("3.2", "Recepción formal en destino, suscripción de conformidad y devolución de cargos de PECOSA", 2, "3.1")
            ]
        ),
        (
            "Inventario Físico Masivo Anual de Existencias de Almacén",
            "Administración de bienes muebles y almacén (S2.3)",
            "Proceso anual de toma de inventario físico de suministros y materiales, conciliación con registros contables.",
            [
                ("1", "FASE 1: PLANIFICACIÓN Y ACTOS PREPARATORIOS", 10, ""),
                ("1.1", "Designación formal de la Comisión de Toma de Inventario de Almacén por la Oficina de Administración", 3, ""),
                ("1.2", "Elaboración y aprobación del cronograma de barrido físico y directiva metodológica de toma de inventario", 4, "1.1"),
                ("1.3", "Corte documentario de operaciones de ingreso y salida en el aplicativo SIGA/SIAF", 3, "1.2"),
                ("2", "FASE 2: LEVANTAMIENTO FÍSICO DE CAMPO", 10, "1"),
                ("2.1", "Conteo físico al 100% de bienes en almacenes centrales y sedes costeras por equipos de conteo", 6, "1.3"),
                ("2.2", "Reconteo de ítems con inconsistencias, diferencias de saldos o indicios de deterioro", 4, "2.1"),
                ("3", "FASE 3: CONCILIACIÓN Y DETERMINACIÓN DE RESULTADOS", 10, "2"),
                ("3.1", "Cruce de información entre el inventario físico levantado y los saldos del kardex en el SIGA", 4, "2.2"),
                ("3.2", "Conciliación contable-almacén con la Unidad de Finanzas determinando sobrantes o faltantes", 3, "3.1"),
                ("3.3", "Elaboración del informe final de inventario y trámite del acta de conciliación y ajustes", 3, "3.2")
            ]
        ),
        (
            "Gestión Patrimonial: Alta, Codificación y Asignación de Bienes Muebles",
            "Administración de bienes muebles y almacén (S2.3)",
            "Incorporación de activos fijos al patrimonio institucional, etiquetado y asignación formal a los servidores.",
            [
                ("1", "FASE 1: EXPEDIENTE DE ALTA PATRIMONIAL", 8, ""),
                ("1.1", "Recepción de PECOSA, órdenes de compra, actas de recepción de inversiones o contratos de donación", 2, ""),
                ("1.2", "Verificación técnica de no fungibilidad y cumplimiento de criterios de activo según directivas del SNA", 3, "1.1"),
                ("1.3", "Elaboración del informe técnico y proyecto de resolución de alta patrimonial por causal establecida", 3, "1.2"),
                ("2", "FASE 2: REGISTRO Y CODIFICACIÓN DEL ACTIVO", 6, "1"),
                ("2.1", "Emisión de la resolución de alta suscrita por la jefatura de la Oficina de Administración", 2, "1.3"),
                ("2.2", "Registro de alta y valorización contable en el Módulo de Patrimonio del SIGA-MEF", 2, "2.1"),
                ("2.3", "Generación de código patrimonial único e impresión de etiquetas con código de barras o placas metálicas", 2, "2.2"),
                ("3", "FASE 3: ROTULADO Y ASIGNACIÓN EN USO", 6, "2"),
                ("3.1", "Colocación física de placa o etiqueta en el bien mueble (equipos científicos, mobiliario, vehículos)", 3, "2.3"),
                ("3.2", "Generación y suscripción obligatoria de la Ficha de Asignación de Bienes Muebles en Uso al servidor", 3, "3.1")
            ]
        ),
        (
            "Gestión Patrimonial: Baja y Disposición Final de Bienes Muebles (RAEE y Ordinarios)",
            "Administración de bienes muebles y almacén (S2.3)",
            "Extracción patrimonial de bienes obsoletos, en desuso o calificados como chatarra o RAEE y destino legal.",
            [
                ("1", "FASE 1: EVALUACIÓN TÉCNICA Y SUSTENTO DE BAJA", 13, ""),
                ("1.1", "Inspección ocular y emisión de informe técnico de inoperatividad, obsolescencia o mantenimiento oneroso", 4, ""),
                ("1.2", "Determinación de causal legal de baja (obsolescencia, chatarra, excedencia, RAEE) y valorización residual", 4, "1.1"),
                ("1.3", "Elaboración de informe técnico legal de sustento de baja remitido a la Dirección de Administración", 5, "1.2"),
                ("2", "FASE 2: FORMALIZACIÓN DE LA BAJA PATRIMONIAL", 5, "1"),
                ("2.1", "Emisión de resolución de baja de bienes suscrita por la Oficina General de Administración", 3, "1.3"),
                ("2.2", "Descargo contable y patrimonial de los bienes dados de baja en el aplicativo SIGA Patrimonio", 2, "2.1"),
                ("3", "FASE 3: PROCEDIMIENTO DE DISPOSICIÓN FINAL", 20, "2"),
                ("3.1", "Publicación del listado de bienes en portal web institucional para donación, subasta o transferencia", 5, "2.2"),
                ("3.2", "Trámite de entrega a Sistemas de Manejo autorizados (para RAEE) o adjudicación por sorteo o subasta", 10, "3.1"),
                ("3.3", "Suscripción de actas de entrega-recepción con los beneficiarios y remisión de expedientes a la DGA", 5, "3.2")
            ]
        ),
        (
            "Inventario Físico Anual de Bienes Patrimoniales Muebles e Inmuebles",
            "Administración de bienes muebles y almacén (S2.3)",
            "Verificación física anual integral de activos patrimoniales institucionales y conciliación patrimonio-contable.",
            [
                ("1", "FASE 1: ACTOS PREPARATORIOS E INSTALACIÓN", 12, ""),
                ("1.1", "Constitución y aprobación por resolución administrativa de la Comisión de Inventario Patrimonial", 3, ""),
                ("1.2", "Capacitación técnica a inventariadores y dotación de equipos de escaneo y lectura óptica", 4, "1.1"),
                ("1.3", "Emisión de directiva interna con cronograma de cierre temporal de oficinas y sedes", 5, "1.2"),
                ("2", "FASE 2: TOMA DE INVENTARIO FÍSICO DE CAMPO", 20, "1"),
                ("2.1", "Barrido de bienes en oficinas de la Sede Central del Callao y registro de códigos en fichas de campo", 8, "1.3"),
                ("2.2", "Levantamiento de inventario en laboratorios costeros descentralizados y embarcaciones científicas", 8, "2.1"),
                ("2.3", "Verificación del estado de conservación, ubicación física y servidor responsable asignado", 4, "2.2"),
                ("3", "FASE 3: CONCILIACIÓN PATRIMONIAL-CONTABLE Y REPORTE", 15, "2"),
                ("3.1", "Identificación de inconsistencias, bienes faltantes, sobrantes no identificados y transferencias", 5, "2.3"),
                ("3.2", "Suscripción del Acta de Conciliación Patrimonio-Contable (Anexo N° 05 Directiva DGA)", 5, "3.1"),
                ("3.3", "Elaboración del Informe Final de Inventario y transmisión electrónica al aplicativo DGA del MEF", 5, "3.2")
            ]
        ),
        (
            "Planificación y Contratación del Aseguramiento de Bienes Muebles e Inmuebles",
            "Administración de bienes muebles y almacén (S2.3)",
            "Determinación del plan de aseguramiento de infraestructura, naves científicas y vehículos, y gestión de pólizas.",
            [
                ("1", "FASE 1: DIAGNÓSTICO DEL RIESGO Y VALORIZACIÓN PATRIMONIAL", 10, ""),
                ("1.1", "Identificación del universo de bienes muebles, embarcaciones científicas e inmuebles institucionales a asegurar", 4, ""),
                ("1.2", "Valorización comercial, contable o valor de reposición de activos estratégicos y flota marítima", 4, "1.1"),
                ("1.3", "Elaboración del Programa de Aseguramiento Institucional de Bienes Muebles e Inmuebles", 2, "1.2"),
                ("2", "FASE 2: CONTRATACIÓN Y ADMINISTRACIÓN DE PÓLIZAS", 14, "1"),
                ("2.1", "Formulación de condiciones técnicas especiales y términos de referencia (slip técnico de seguros)", 4, "1.3"),
                ("2.2", "Contratación de pólizas multirriesgo (casco y maquinaria naval, 3D, deshonestidad, transporte)", 6, "2.1"),
                ("2.3", "Recepción, control y registro de pólizas de seguro suscritas en el Registro de Aseguramiento del MEF", 4, "2.2"),
                ("3", "FASE 3: GESTIÓN DE ATENCIÓN DE SINIESTROS PATRIMONIALES", 15, "2"),
                ("3.1", "Aviso inmediato del siniestro ante la compañía aseguradora y levantamiento de acta de daños", 2, "2.3"),
                ("3.2", "Coordinación de inspección con ajustadores de seguros y entrega de carpetas probatorias", 8, "3.1"),
                ("3.3", "Liquidación de indemnización de siniestro, deducción de deducibles e ingreso financiero o reposición", 5, "3.2")
            ]
        ),
        (
            "Mantenimiento Preventivo y Correctivo de la Flota Vehicular Terrestre",
            "Gestión de servicios generales y mantenimiento (S2.4)",
            "Gestión del mantenimiento programado y reparaciones mecánicas de camionetas y vehículos de campo del IMARPE.",
            [
                ("1", "FASE 1: CONTROL DE KILOMETRAJE Y PROGRAMACIÓN DE SERVICIOS", 4, ""),
                ("1.1", "Control continuo de bitácoras de desplazamiento y lectura de horómetros/odómetros de camionetas", 2, ""),
                ("1.2", "Revisión técnica vehicular previa y diagnóstico de necesidades de servicio en taller", 2, "1.1"),
                ("2", "FASE 2: EJECUCIÓN DEL MANTENIMIENTO EN TALLER", 7, "1"),
                ("2.1", "Generación de orden de servicio e internamiento del vehículo institucional en taller autorizado", 2, "1.2"),
                ("2.2", "Desarrollo de trabajos mecánicos, cambio de lubricantes, fluidos, filtros y componentes de desgaste", 3, "2.1"),
                ("2.3", "Reparaciones correctivas adicionales detectadas y pruebas técnicas de rendimiento en ruta", 2, "2.2"),
                ("3", "FASE 3: RECEPCIÓN Y ACTUALIZACIÓN DEL HISTORIAL VEHICULAR", 4, "2"),
                ("3.1", "Inspección técnica de salida del taller por el mecánico/responsable de transportes del IMARPE", 1, "2.3"),
                ("3.2", "Emisión de la conformidad del servicio de mantenimiento por el Área de Transportes", 1, "3.1"),
                ("3.3", "Actualización obligatoria de la Ficha Técnica Vehicular (Anexo N° 08 de Directiva de Bienes Muebles)", 2, "3.2")
            ]
        ),
        (
            "Mantenimiento de Infraestructura Física, Instalaciones y Servicios Generales",
            "Gestión de servicios generales y mantenimiento (S2.4)",
            "Mantenimiento rutinario de sedes, acondicionamientos de laboratorios costeros y administración de servicios.",
            [
                ("1", "FASE 1: PROGRAMACIÓN Y LEVANTAMIENTO DE NECESIDADES", 7, ""),
                ("1.1", "Inspección técnica de edificaciones, instalaciones eléctricas, sanitarias y sistemas de climatización", 3, ""),
                ("1.2", "Consolidación de requerimientos de acondicionamiento o reparación en el Plan de Mantenimiento", 4, "1.1"),
                ("2", "FASE 2: GESTIÓN DE LAS INTERVENCIONES DE MANTENIMIENTO", 14, "1"),
                ("2.1", "Formulación de especificaciones técnicas para servicios de gasfitería, pintura, cerrajería o refrigeración", 3, "1.2"),
                ("2.2", "Ejecución de actividades de mantenimiento rutinario con personal técnico o contratistas especializados", 8, "2.1"),
                ("2.3", "Supervisión técnica de campo verificando estándares de calidad y seguridad industrial", 3, "2.2"),
                ("3", "FASE 3: CONFORMIDAD, CERTIFICACIONES Y CONTROL DE SERVICIOS", 8, "2"),
                ("3.1", "Suscripción de actas de recepción de trabajos de acondicionamiento y mantenimiento de instalaciones", 2, "2.3"),
                ("3.2", "Tramitación y renovación de Certificados de Inspección Técnica de Seguridad en Edificaciones (ITSE)", 4, "3.1"),
                ("3.3", "Control mensual de facturación de servicios públicos esenciales (agua potable, electricidad y gas)", 2, "3.2")
            ]
        ),
        (
            "Elaboración y Aprobación de Expedientes Técnicos y Documentos Equivalentes (UEI)",
            "Gestión de infraestructura pública y obras (UEI) (S2.5)",
            "Gestión técnica de estudios definitivos para infraestructura científica, consistencia con UF y aprobación formal.",
            [
                ("1", "FASE 1: ACTOS PREPARATORIOS Y DISPONIBILIDAD DE PREDIO", 12, ""),
                ("1.1", "Formulación de TDR para consultoría de obra por ingenieros/arquitecto de la UEI (con requisitos BIM)", 5, ""),
                ("1.2", "Verificación y suscripción de acta de disponibilidad física del predio antes del inicio (Art. 32.1)", 3, "1.1"),
                ("1.3", "Contratación y entrega de terreno al proyectista adjudicado para la elaboración del estudio definitivo", 4, "1.2"),
                ("2", "FASE 2: DESARROLLO, REVISIÓN TÉCNICA Y MODELADO DEL EXPEDIENTE", 65, "1"),
                ("2.1", "Elaboración de estudios básicos de ingeniería (topografía, mecánica de suelos, georreferenciación)", 15, "1.3"),
                ("2.2", "Desarrollo de diseños y planos de arquitectura, estructuras, instalaciones eléctricas, sanitarias y de bioseguridad", 25, "2.1"),
                ("2.3", "Estructuración de memorias descriptivas, especificaciones técnicas, metrados, análisis de precios y presupuesto", 15, "2.2"),
                ("2.4", "Modelamiento digital de información del proyecto (PIM) y detección de interferencias (si aplica BIM)", 10, "2.3"),
                ("3", "FASE 3: CONSISTENCIA TÉCNICA CON UF Y APROBACIÓN RESOLUTIVA", 17, "2"),
                ("3.1", "Revisión final y visación integral del expediente por el equipo de ingenieros y arquitecto de la UEI", 5, "2.4"),
                ("3.2", "Remisión de expediente a la OPPM (UF) y evaluación de consistencia técnica y dimensionamiento", 5, "3.1"),
                ("3.3", "Registro en Banco de Inversiones del Formato N° 08-A o 08-C Sección A (Consistencia técnica aprobada por UF)", 2, "3.2"),
                ("3.4", "Emisión del acto resolutivo de aprobación del Expediente Técnico o Documento Equivalente", 3, "3.3"),
                ("3.5", "Registro del Formato N° 08-A o 08-C Sección B en el Banco de Inversiones por el responsable de la UEI", 2, "3.4")
            ]
        ),
        (
            "Ejecución Física, Supervisión de Obra y Control en INFOBRAS (UEI)",
            "Gestión de infraestructura pública y obras (UEI) (S2.5)",
            "Desarrollo constructivo, control mensual en Formato 12-B e INFOBRAS, modificaciones y recepción técnica.",
            [
                ("1", "FASE 1: INICIO CONTRACTUAL Y CONDICIONES PREVIAS DE OBRA", 8, ""),
                ("1.1", "Suscripción del acta formal de entrega de terreno con el contratista ejecutor y supervisor de obra", 2, ""),
                ("1.2", "Apertura y legalización del cuaderno de obra digital o físico y verificación de planes de seguridad", 3, "1.1"),
                ("1.3", "Registro inicial de la obra y designación de responsables de monitoreo en el sistema INFOBRAS de CGR", 3, "1.2"),
                ("2", "FASE 2: SEGUIMIENTO MENSUAL, MODIFICACIONES Y CONTROL FÍSICO", 30, "1"),
                ("2.1", "Inspección técnica de avances de obra en campo por ingenieros/arquitecto de la UEI", 8, "1.3"),
                ("2.2", "Revisión y aprobación de valorizaciones mensuales de obra presentadas por la supervisión", 5, "2.1"),
                ("2.3", "Actualización mensual del Formato N° 12-B en el aplicativo del Banco de Inversiones (dentro de primeros 10 días)", 3, "2.2"),
                ("2.4", "Carga de avances valorizados, registros fotográficos y reportes mensuales en INFOBRAS", 4, "2.3"),
                ("2.5", "Trámite y aprobación de modificaciones en ejecución física (adicionales, ampliaciones) y registro en Formato 08 Sección C", 10, "2.4"),
                ("3", "FASE 3: CULMINACIÓN FÍSICA Y RECEPCIÓN FORMAL DE LA OBRA", 25, "2"),
                ("3.1", "Notificación de culminación de obra por el contratista y verificación por el supervisor", 3, "2.5"),
                ("3.2", "Designación formal del Comité de Recepción de Obra por la Oficina de Administración", 4, "3.1"),
                ("3.3", "Inspección física de pruebas de funcionamiento de instalaciones y equipamiento instalado", 8, "3.2"),
                ("3.4", "Levantamiento de pliego de observaciones técnicas (en caso se hubieran identificado)", 7, "3.3"),
                ("3.5", "Suscripción formal del Acta de Recepción de Obra culminada al 100% de metas físicas", 3, "3.4")
            ]
        ),
        (
            "Liquidación Técnica-Financiera, Cierre y Transferencia de Inversiones (Formato 09)",
            "Gestión de infraestructura pública y obras (UEI) (S2.5)",
            "Cierre físico-financiero de la inversión, liquidación de contratos, registro en BI y pase a patrimonio/mantenimiento.",
            [
                ("1", "FASE 1: REGISTRO DE CULMINACIÓN FÍSICA EN EL BANCO DE INVERSIONES", 10, ""),
                ("1.1", "Elaboración del informe de sustento de culminación de metas físicas y consolidación de actas", 5, ""),
                ("1.2", "Registro formal del Formato N° 09 Sección B en el Banco de Inversiones (plazo máx. 60 días calendario post-recepción)", 5, "1.1"),
                ("2", "FASE 2: LIQUIDACIÓN TÉCNICA Y FINANCIERA DE CONTRATOS", 30, "1"),
                ("2.1", "Presentación de la liquidación del contrato de obra por el contratista o elaboración de oficio por la UEI", 10, "1.2"),
                ("2.2", "Revisión técnica de metrados finales, reajustes, valorizaciones pagadas y saldos financieros", 10, "2.1"),
                ("2.3", "Emisión de resolución administrativa que aprueba la liquidación del contrato de obra/consultoría", 5, "2.2"),
                ("2.4", "Finiquito de pagos pendientes, devolución de cartas fianza de fiel cumplimiento y consentimiento", 5, "2.3"),
                ("3", "FASE 3: REGISTRO DE CIERRE DE INVERSIÓN Y TRANSFERENCIA DE ACTIVOS", 14, "2"),
                ("3.1", "Elaboración del informe de cierre de inversión consolidando costo final real ejecutado", 4, "2.4"),
                ("3.2", "Registro del Formato N° 09 Sección C (Cierre formal definitivo) en el BI (plazo máx. 180 días post-Sección B)", 3, "3.1"),
                ("3.3", "Suscripción de acta de transferencia de activos físicos a la Unidad de Abastecimiento y Control Patrimonial", 3, "3.2"),
                ("3.4", "Notificación a la Unidad de Finanzas para el traslado contable a cuentas de activo fijo definitivo", 2, "3.3"),
                ("3.5", "Entrega de manuales y carpetas técnicas al área de Mantenimiento (S2.4.2) para el inicio de la operación sostenible", 2, "3.4")
            ]
        ),

        # --- BLOQUE 2: PLANEAMIENTO, MODERNIZACIÓN, PRESUPUESTO E INVERSIONES ---
        (
            "Formulación y Actualización del Plan Estratégico Institucional (PEI)",
            "Dirección y gestión estratégica (E1)",
            "Definición y validación de Objetivos y Acciones Estratégicas Institucionales articuladas al PESEM PRODUCE y Plan Estratégico de Desarrollo Nacional.",
            [
                ("1", "FASE 1: ACTOS PREVIOS Y CONFORMACIÓN DE LA COMISIÓN", 8, ""),
                ("1.1", "Emisión de resolución de presidencia ejecutiva que conforma la comisión de planeamiento estratégico", 3, ""),
                ("1.2", "Difusión de la guía metodológica de CEPLAN y pautas técnicas para el ciclo de planeamiento", 2, "1.1"),
                ("1.3", "Aprobación del plan de trabajo interno y cronograma de talleres participativos", 3, "1.2"),
                ("2", "FASE 2: DIAGNÓSTICO INSTITUCIONAL Y FORMULACIÓN ESTRATÉGICA", 25, "1"),
                ("2.1", "Análisis del entorno, caracterización de usuarios y diagnóstico situacional de la investigación marina", 8, "1.3"),
                ("2.2", "Formulación de la declaración de política institucional y definición de objetivos estratégicos (OEI)", 6, "2.1"),
                ("2.3", "Estructuración de acciones estratégicas institucionales (AEI) y diseño de fichas de indicadores", 7, "2.2"),
                ("2.4", "Validación de metas multianuales con los centros de costos y direcciones de línea del IMARPE", 4, "2.3"),
                ("3", "FASE 3: VALIDACIÓN SECTORIAL, REGISTRO EN CEPLAN Y APROBACIÓN", 15, "2"),
                ("3.1", "Registro y articulación de la matriz del PEI en el aplicativo informático CEPLAN V.01", 4, "2.4"),
                ("3.2", "Remisión de propuesta a la oficina de planeamiento de PRODUCE y trámite de opinión técnica de CEPLAN", 7, "3.1"),
                ("3.3", "Emisión de la resolución de aprobación del PEI por el titular de la entidad y publicación oficial", 4, "3.2")
            ]
        ),
        (
            "Elaboración y Aprobación del Plan Operativo Institucional (POI) Multianual",
            "Dirección y gestión estratégica (E1)",
            "Programación física y financiera de actividades operativas e inversiones para un horizonte de 3 años en aplicativo CEPLAN.",
            [
                ("1", "FASE 1: PREPARACIÓN Y CONFIGURACIÓN DEL APLICATIVO", 6, ""),
                ("1.1", "Emisión de lineamientos metodológicos internos para la programación física y costeo multianual", 3, ""),
                ("1.2", "Habilitación de centros de costos, metas y usuarios en el aplicativo CEPLAN V.01", 3, "1.1"),
                ("2", "FASE 2: PROGRAMACIÓN FÍSICA Y FINANCIERA POR ÁREAS USUARIAS", 16, "1"),
                ("2.1", "Registro de actividades operativas y tareas asociadas a las metas de investigación científica en el aplicativo", 7, "1.2"),
                ("2.2", "Articulación de requerimientos logísticos con la fase de identificación del CMN en el SIGA", 5, "2.1"),
                ("2.3", "Revisión técnica de consistencia operativa por el equipo de planeamiento de la OPPM", 4, "2.2"),
                ("3", "FASE 3: CONSOLIDACIÓN, APROBACIÓN Y REPORTE", 8, "2"),
                ("3.1", "Generación del reporte consolidado del POI Multianual B-4 y suscripción del informe técnico", 3, "2.3"),
                ("3.2", "Emisión de resolución de aprobación del POI Multianual por el titular del pliego antes del 30 de abril", 3, "3.1"),
                ("3.3", "Publicación del POI Multianual en el portal de transparencia estándar y remisión formal a CEPLAN", 2, "3.2")
            ]
        ),
        (
            "Consistencia del POI Anual con el Presupuesto Institucional de Apertura (PIA)",
            "Dirección y gestión estratégica (E1)",
            "Ajuste de metas físicas y financieras de actividades operativas respecto al presupuesto aprobado para el año fiscal.",
            [
                ("1", "FASE 1: CONCILIACIÓN DE TECHOS PRESUPUESTALES", 6, ""),
                ("1.1", "Descarga de la estructura funcional programática y asignación por genérica del gasto del PIA aprobado", 2, ""),
                ("1.2", "Cotejo de montos presupuestados por centro de costos frente a la programación financiera del POI", 4, "1.1"),
                ("2", "FASE 2: AJUSTE OPERATIVO EN EL APLICATIVO CEPLAN", 9, "1"),
                ("2.1", "Notificación de techos a centros de costos y reajuste de metas físicas de actividades operativas", 4, "1.2"),
                ("2.2", "Registro del ajuste financiero y físico en el aplicativo informático CEPLAN V.01", 3, "2.1"),
                ("2.3", "Validación técnica de consistencia presupuestal-operativa a cargo del equipo de la OPPM", 2, "2.2"),
                ("3", "FASE 3: FORMALIZACIÓN Y PUBLICACIÓN DEL POI CONSISTENTE", 6, "2"),
                ("3.1", "Generación del reporte final Anexo B-5 del POI consistente con el PIA", 2, "2.3"),
                ("3.2", "Emisión de resolución de presidencia ejecutiva que aprueba el POI consistente (antes del 31 de diciembre)", 2, "3.1"),
                ("3.3", "Publicación del POI consistente aprobado en el portal de transparencia estándar del IMARPE", 2, "3.2")
            ]
        ),
        (
            "Seguimiento y Evaluación Periódica del POI y PEI (Trimestral / Semestral / Anual)",
            "Dirección y gestión estratégica (E1)",
            "Medición del cumplimiento físico y financiero de metas del POI y avance de indicadores del PEI con reporte a CEPLAN.",
            [
                ("1", "FASE 1: RECOLECCIÓN Y REGISTRO DE AVANCES FÍSICOS", 10, ""),
                ("1.1", "Apertura de aplicativo informático y notificación a centros de costos al cierre del periodo evaluado", 2, ""),
                ("1.2", "Carga de ejecución de metas físicas y justificación de desviaciones por responsables de centro de costo", 5, "1.1"),
                ("1.3", "Extracción y consolidación del devengado acumulado desde el módulo presupuestal SIAF-SP/RP", 3, "1.2"),
                ("2", "FASE 2: CONTROL DE CALIDAD Y ANÁLISIS DE DESEMPEÑO", 8, "1"),
                ("2.1", "Validación técnica de medios de verificación cargados por las unidades operativas y científicas", 4, "1.3"),
                ("2.2", "Cálculo de índices de eficacia física, eficiencia presupuestal y semaforización de alertas", 4, "2.1"),
                ("3", "FASE 3: ELABORACIÓN Y COMUNICACIÓN DEL INFORME OFICIAL", 8, "2"),
                ("3.1", "Elaboración del informe de seguimiento trimestral o informe semestral/anual de evaluación POI-PEI", 4, "2.2"),
                ("3.2", "Presentación del informe a gerencia general y presidencia ejecutiva con medidas correctivas", 2, "3.1"),
                ("3.3", "Registro final en la plataforma CEPLAN y publicación en el portal web institucional", 2, "3.2")
            ]
        ),
        (
            "Diseño, Mantenimiento y Aprobación del Mapa de Procesos Institucional (MPI)",
            "Gestión de la modernización y mejora institucional (E2)",
            "Identificación de macroprocesos, inventario de productos y formalización del MPI según Norma Técnica N° 002-2025-PCM/SGP.",
            [
                ("1", "FASE 1: PREPARACIÓN Y LEVANTAMIENTO DE CADENA DE VALOR", 10, ""),
                ("1.1", "Revisión del marco legal, competencias exclusivas del ROF y política nacional de modernización", 3, ""),
                ("1.2", "Talleres de trabajo con dueños de procesos estratégicos, misionales y de soporte del IMARPE", 4, "1.1"),
                ("1.3", "Identificación de destinatarios de bienes/servicios y determinación del inventario de productos Nivel 0", 3, "1.2"),
                ("2", "FASE 2: MODELADO GRÁFICO Y ESTRUCTURACIÓN DEL MAPA", 12, "1"),
                ("2.1", "Estructuración y codificación de macroprocesos E, M y S según directrices de SGP-PCM", 4, "1.3"),
                ("2.2", "Diagramación del mapa de procesos institucional de Nivel 0 bajo estándar BPMN", 4, "2.1"),
                ("2.3", "Redacción de fichas descriptivas de procesos de Nivel 0 y conciliación con directivos institucionales", 4, "2.2"),
                ("3", "FASE 3: EXPEDIENTE TÉCNICO, OPINIÓN LEGAL Y APROBACIÓN", 10, "2"),
                ("3.1", "Elaboración del informe técnico de sustento por el equipo de modernización de la OPPM", 3, "2.3"),
                ("3.2", "Remisión y emisión de opinión jurídica favorable por la Oficina General de Asesoría Jurídica", 4, "3.1"),
                ("3.3", "Emisión de resolución de gerencia general de aprobación del MPI y publicación en sede digital", 3, "3.2")
            ]
        ),
        (
            "Despliegue de Procesos a Nivel 1, 2 y 3 (Fichas de Proceso y Matriz SIPOC)",
            "Gestión de la modernización y mejora institucional (E2)",
            "Caracterización detallada de subprocesos, entradas, proveedores, salidas y clientes según Guía Práctica SGP-PCM.",
            [
                ("1", "FASE 1: DELIMITACIÓN Y SECUENCIAMIENTO OPERATIVO", 8, ""),
                ("1.1", "Definición del alcance, objetivo y disparador del proceso con el dueño de proceso designado", 3, ""),
                ("1.2", "Mapeo secuencial de actividades operativas y determinación del equipo técnico participante", 5, "1.1"),
                ("2", "FASE 2: CARACTERIZACIÓN SIPOC Y DISEÑO DE DIAGRAMAS BPMN", 14, "1"),
                ("2.1", "Identificación de proveedores (P), insumos/entradas (I), productos/salidas (O) y clientes (C)", 5, "1.2"),
                ("2.2", "Modelamiento del flujograma de proceso en carriles de responsabilidad (swimlanes) en software BPM", 5, "2.1"),
                ("2.3", "Formulación de indicadores de desempeño (tiempo de ciclo, costo y calidad) y controles de riesgos", 4, "2.2"),
                ("3", "FASE 3: REVISIÓN, VISACIÓN Y DIFUSIÓN OPERATIVA", 7, "2"),
                ("3.1", "Control de calidad metodológico del expediente de ficha de proceso y diagramas por la OPPM", 3, "2.3"),
                ("3.2", "Suscripción formal de la ficha de proceso por el dueño de proceso y jefatura de la OPPM", 2, "3.1"),
                ("3.3", "Publicación del catálogo de procesos en la intranet institucional y repositorio de gestión", 2, "3.2")
            ]
        ),
        (
            "Elaboración y Aprobación de Documentos Normativos Institucionales (Directivas y Procedimientos)",
            "Gestión de la modernización y mejora institucional (E2)",
            "Estandarización de reglas de negocio y flujos de trabajo mediante directivas, manuales de procedimientos y protocolos.",
            [
                ("1", "FASE 1: FORMULACIÓN TÉCNICA DEL PROYECTO NORMATIVO", 12, ""),
                ("1.1", "Redacción del proyecto de directiva o procedimiento con base en la estructura estándar institucional", 5, ""),
                ("1.2", "Articulación del texto normativo con los flujogramas y fichas de procesos aprobadas", 4, "1.1"),
                ("1.3", "Socialización del borrador con las unidades orgánicas intervinientes y consolidación de aportes", 3, "1.2"),
                ("2", "FASE 2: EVALUACIÓN METODOLÓGICA Y OPINIÓN JURÍDICA", 9, "1"),
                ("2.1", "Revisión técnica y emisión de informe de viabilidad metodológica por el área de modernización (OPPM)", 4, "1.3"),
                ("2.2", "Revisión de legalidad y emisión de informe de viabilidad jurídica por la Asesoría Jurídica", 5, "2.1"),
                ("3", "FASE 3: EMISIÓN RESOLUTIVA Y COMUNICACIÓN INSTITUCIONAL", 5, "2"),
                ("3.1", "Emisión de resolución de gerencia general o presidencia ejecutiva que aprueba el documento normativo", 2, "2.2"),
                ("3.2", "Registro y asignación de código correlativo en el repositorio institucional de normas internas", 1, "3.1"),
                ("3.3", "Difusión oficial a todo el personal institucional mediante circular digital y publicación web", 2, "3.2")
            ]
        ),
        (
            "Mantenimiento y Auditoría del Sistema de Gestión Integrado (ISO 9001 / ISO 37001)",
            "Gestión de la modernización y mejora institucional (E2)",
            "Gestión de no conformidades, planes de auditoría interna y revisión por la dirección del sistema integrado de gestión.",
            [
                ("1", "FASE 1: PLANIFICACIÓN Y AUDITORÍA INTERNA DEL SGI", 15, ""),
                ("1.1", "Elaboración y aprobación del programa anual de auditorías internas del sistema de gestión integrado", 3, ""),
                ("1.2", "Designación y calibración del equipo de auditores internos certificados en normas ISO", 3, "1.1"),
                ("1.3", "Ejecución de auditorías internas en sedes y revisión documental de procesos bajo alcance", 6, "1.2"),
                ("1.4", "Emisión y notificación del informe preliminar de hallazgos y no conformidades identificadas", 3, "1.3"),
                ("2", "FASE 2: TRATAMIENTO DE NO CONFORMIDADES Y ACCIONES CORRECTIVAS", 14, "1"),
                ("2.1", "Análisis de causa raíz mediante metodologías estandarizadas (diagrama de Ishikawa, 5 Porqués)", 4, "1.4"),
                ("2.2", "Formulación de planes de acción correctiva por los dueños de proceso auditados", 5, "2.1"),
                ("2.3", "Seguimiento e inspección de la eficacia de las acciones correctivas implementadas", 5, "2.2"),
                ("3", "FASE 3: REVISIÓN POR LA DIRECCIÓN Y AUDITORÍA EXTERNA", 11, "2"),
                ("3.1", "Consolidación de informes de desempeño del SGI, matriz de riesgos de soborno y calidad", 4, "2.3"),
                ("3.2", "Desarrollo de la sesión de revisión por la alta dirección y suscripción de acta con compromisos", 2, "3.1"),
                ("3.3", "Atención de la auditoría externa de seguimiento o certificación por ente certificador acreditado", 5, "3.2")
            ]
        ),
        (
            "Programación Multianual Presupuestaria y Formulación del Presupuesto Institucional",
            "Gestión del presupuesto público (S3.1)",
            "Determinación de la estructura del anteproyecto presupuestal del IMARPE y sustento ante la DGPP-MEF.",
            [
                ("1", "FASE 1: ESTIMACIÓN DE INGRESOS Y DETERMINACIÓN DE LA APM", 10, ""),
                ("1.1", "Proyección multianual de ingresos por Recursos Directamente Recaudados (análisis TUSNE y convenios)", 4, ""),
                ("1.2", "Recepción y análisis de la Asignación Presupuestaria Multianual (APM) comunicada por la DGPP-MEF", 3, "1.1"),
                ("1.3", "Desagregación del techo presupuestal preliminar por genéricas de gasto y categorías presupuestales", 3, "1.2"),
                ("2", "FASE 2: FORMULACIÓN PRESUPUESTARIA ARTICULADA A PPR Y METAS", 16, "1"),
                ("2.1", "Coordinación con responsables técnicos de Programas Presupuestales (PP 0068, PP 0094, PP 0095)", 5, "1.3"),
                ("2.2", "Articulación presupuestal con el Cuadro Multianual de Necesidades (CMN) y POI Multianual", 6, "2.1"),
                ("2.3", "Carga de la propuesta institucional en el aplicativo del Sistema Integrado de Administración Financiera (SIAF)", 5, "2.2"),
                ("3", "FASE 3: SUSTENTACIÓN ANTE EL SECTOR Y DGPP-MEF", 10, "2"),
                ("3.1", "Elaboración de la carpeta técnica y exposición del anteproyecto presupuestal ante PRODUCE", 4, "2.3"),
                ("3.2", "Participación en reuniones de sustentación y conciliación técnica ante analistas de la DGPP-MEF", 4, "3.1"),
                ("3.3", "Ajuste de cifras finales de gasto conforme al proyecto de Ley de Presupuesto presentado al Congreso", 2, "3.2")
            ]
        ),
        (
            "Aprobación y Desagregación del Presupuesto Institucional de Apertura (PIA)",
            "Gestión del presupuesto público (S3.1)",
            "Desagregación del presupuesto aprobado en la Ley Anual de Presupuesto y emisión de resolución de PIA antes del 31 de diciembre.",
            [
                ("1", "FASE 1: CONCILIACIÓN DEL MARCO LEGAL APROBADO", 4, ""),
                ("1.1", "Revisión de anexos y asignaciones específicas asignadas al pliego IMARPE en la Ley Anual de Presupuesto", 2, ""),
                ("1.2", "Cotejo de montos por fuentes de financiamiento, rubros y unidades ejecutoras en el SIAF", 2, "1.1"),
                ("2", "FASE 2: ESTRUCTURACIÓN Y APROBACIÓN RESOLUTIVA", 5, "1"),
                ("2.1", "Elaboración de los reportes oficiales de desagregado de ingresos y gastos a nivel de partidas y metas", 2, "1.2"),
                ("2.2", "Redacción y visación del proyecto de resolución de aprobación del PIA por la OPPM y OGAJ", 2, "2.1"),
                ("2.3", "Firma formal de la resolución por el titular del pliego IMARPE (a más tardar el 31 de diciembre)", 1, "2.2"),
                ("3", "FASE 3: TRANSMISIÓN ELECTRÓNICA Y PUBLICACIÓN OFICIAL", 4, "2"),
                ("3.1", "Aprobación y transmisión electrónica de la versión oficial del PIA en el módulo SIAF-SP/RP", 1, "2.3"),
                ("3.2", "Publicación de la resolución y anexos en el portal de transparencia estándar (plazo máx. 5 días)", 2, "3.1"),
                ("3.3", "Remisión oficial de carpetas a DGPP-MEF, Contraloría General y Comisión de Presupuesto del Congreso", 1, "3.2")
            ]
        ),
        (
            "Gestión de Modificaciones Presupuestarias en el Nivel Funcional y Programático",
            "Gestión del presupuesto público (S3.1)",
            "Habilitaciones y anulaciones entre metas y genéricas de gasto mediante notas modificatorias mensuales.",
            [
                ("1", "FASE 1: EVALUACIÓN DE SOLICITUDES Y LIMITACIONES LEGALES", 5, ""),
                ("1.1", "Recepción de informes de sustentación remitidos por centros de costos requiriendo transferencias internas", 2, ""),
                ("1.2", "Evaluación técnica verificando restricciones legales de ley (partidas restringidas, inversiones y PpR)", 3, "1.1"),
                ("2", "FASE 2: REGISTRO DE NOTAS MODIFICATORIAS EN SIAF", 4, "1"),
                ("2.1", "Elaboración del informe técnico de viabilidad presupuestal suscrito por la jefatura de la OPPM", 2, "1.2"),
                ("2.2", "Creación y transmisión de las notas de modificación presupuestaria en el aplicativo SIAF-SP/RP", 2, "2.1"),
                ("3", "FASE 3: FORMALIZACIÓN MEDIANTE RESOLUCIÓN MENSUAL", 4, "2"),
                ("3.1", "Consolidación de notas aprobadas en el mes calendario y redacción de resolución de gerencia general", 2, "2.2"),
                ("3.2", "Suscripción formal de la resolución y comunicación de actualización a las unidades operativas", 2, "3.1")
            ]
        ),
        (
            "Gestión de Certificaciones de Crédito Presupuestario (CCP) y Previsiones",
            "Gestión del presupuesto público (S3.1)",
            "Emisión de constancias de cobertura de gasto para convocatorias SEACE, compras menores y contratos multianuales.",
            [
                ("1", "FASE 1: VERIFICACIÓN DEL REQUERIMIENTO Y MARCO DISPONIBLE", 2, ""),
                ("1.1", "Recepción de solicitud de certificación adjuntando pedido SIGA, TDR y valor estimado", 1, ""),
                ("1.2", "Control de saldo presupuestal libre de afectación en la cadena de gasto y fuente respectiva", 1, "1.1"),
                ("2", "FASE 2: REGISTRO Y APROBACIÓN EN EL SIAF", 2, "1"),
                ("2.1", "Generación y transmisión electrónica de la certificación presupuestal en el módulo SIAF-SP/RP", 1, "1.2"),
                ("2.2", "Verificación del estado de aprobación oficial emitido por el sistema central del MEF", 1, "2.1"),
                ("3", "FASE 3: EMISIÓN DE CONSTANCIAS Y ARCHIVO", 2, "2"),
                ("3.1", "Emisión y firma del Certificado de Crédito Presupuestario (CCP) o Constancia de Previsión Presupuestaria", 1, "2.2"),
                ("3.2", "Notificación electrónica del documento a la Oficina de Administración (Abastecimiento) para continuar trámite", 1, "3.1")
            ]
        ),
        (
            "Evaluación Semestral y Anual de la Ejecución Presupuestaria",
            "Gestión del presupuesto público (S3.1)",
            "Análisis del avance físico-financiero de ingresos y gastos, conciliación de marco legal y propuestas de mejora.",
            [
                ("1", "FASE 1: RECOPILACIÓN Y CONCILIACIÓN DE INFORMACIÓN DE GASTO", 8, ""),
                ("1.1", "Extracción y consolidación de la información de compromisos, devengados y giros acumulados en SIAF", 3, ""),
                ("1.2", "Conciliación del marco legal del presupuesto y ejecución acumulada con la Unidad de Finanzas (Contabilidad)", 5, "1.1"),
                ("2", "FASE 2: MEDICIÓN DE INDICADORES Y ANÁLISIS DE EFICIENCIA", 9, "1"),
                ("2.1", "Evaluación de la ejecución financiera por categorías presupuestales, genéricas y proyectos de inversión", 4, "1.2"),
                ("2.2", "Análisis del cumplimiento de metas físicas vinculadas a los productos de los Programas Presupuestales", 5, "2.1"),
                ("3", "FASE 3: ELABORACIÓN DEL INFORME Y TRANSMISIÓN A DGPP", 8, "2"),
                ("3.1", "Redacción del informe de evaluación presupuestaria conteniendo conclusiones y medidas de ajuste", 4, "2.2"),
                ("3.2", "Registro y transmisión del informe en el Módulo de Evaluación de la DGPP-MEF", 2, "3.1"),
                ("3.3", "Presentación del informe técnico a gerencia general y publicación en la página web institucional", 2, "3.2")
            ]
        ),
        (
            "Diagnóstico Institucional de Brechas y Criterios de Priorización de Inversiones (UF)",
            "Gestión de inversiones públicas (Unidad Formuladora) (S3.4)",
            "Levantamiento de información de la UP IMARPE, cálculo de indicadores de brecha de CTI y propuesta de cartera.",
            [
                ("1", "FASE 1: LEVANTAMIENTO DE INFORMACIÓN Y LÍNEA BASE", 8, ""),
                ("1.1", "Recopilación de reportes sobre el estado situacional de laboratorios, estaciones y naves científicas", 4, ""),
                ("1.2", "Cotejo de la capacidad instalada y brechas técnicas con los estándares fijados en la RM N° 202-2024-PCM", 4, "1.1"),
                ("2", "FASE 2: CUANTIFICACIÓN DEL INDICADOR Y PRIORIZACIÓN", 10, "1"),
                ("2.1", "Cálculo de la brecha institucional de infraestructura y acceso a servicios de investigación científica CTI", 4, "1.2"),
                ("2.2", "Aplicación de criterios de priorización sectoriales a las necesidades de inversión planteadas", 3, "2.1"),
                ("2.3", "Elaboración del informe técnico de diagnóstico de brechas institucionales por el formulador de la OPPM", 3, "2.2"),
                ("3", "FASE 3: VALIDACIÓN, REGISTRO Y REPORTE AL SECTOR PRODUCE", 7, "2"),
                ("3.1", "Registro de variables del Formato N° 04-A en el aplicativo de programación multianual del MEF", 2, "2.3"),
                ("3.2", "Suscripción formal del informe diagnóstico de brechas por la jefatura de la OPPM (Responsable UF)", 2, "3.1"),
                ("3.3", "Remisión oficial del diagnóstico de brechas a la OPMI PRODUCE para la consolidación del PMI Sectorial", 3, "3.2")
            ]
        ),
        (
            "Identificación y Registro de Ideas de Proyectos de Inversión y Programas (Formato 05-A)",
            "Gestión de inversiones públicas (Unidad Formuladora) (S3.4)",
            "Ingreso oficial de nuevas ideas de proyectos en el Banco de Inversiones, análisis de consistencia y cierre de brecha.",
            [
                ("1", "FASE 1: RECEPCIÓN Y EVALUACIÓN PRELIMINAR DE LA INICIATIVA", 5, ""),
                ("1.1", "Recepción de ficha preliminar de iniciativa de inversión remitida por direcciones de línea científica", 2, ""),
                ("1.2", "Evaluación preliminar de alineamiento al cierre de brechas y verificación de competencias institucionales", 3, "1.1"),
                ("2", "FASE 2: CONTROL DE NO DUPLICIDAD Y FORMULACIÓN DEL FORMATO", 5, "1"),
                ("2.1", "Búsqueda en módulo de consulta avanzada del Banco de Inversiones para descartar duplicidades de proyectos", 2, "1.2"),
                ("2.2", "Estructuración de datos de localización, objetivo preliminar, beneficiarios y monto tentativo", 3, "2.1"),
                ("3", "FASE 3: REGISTRO Y SUSCRIPCIÓN EN EL BANCO DE INVERSIONES", 4, "2"),
                ("3.1", "Carga de campos obligatorios en el aplicativo del Formato N° 05-A del Banco de Inversiones", 2, "2.2"),
                ("3.2", "Firma digital del Formato N° 05-A por el responsable de la Unidad Formuladora y generación de código", 2, "3.1")
            ]
        ),
        (
            "Identificación y Registro Agregado de Ideas de IOARR (Formato 05-B)",
            "Gestión de inversiones públicas (Unidad Formuladora) (S3.4)",
            "Registro en el Banco de Inversiones de iniciativas puntuales de optimización, reposición, ampliación o rehabilitación.",
            [
                ("1", "FASE 1: ANÁLISIS DE LA NATURALEZA DE LA INTERVENCIÓN", 4, ""),
                ("1.1", "Recepción de requerimientos de adquisición o reposición de equipamiento científico o mobiliario", 1, ""),
                ("1.2", "Verificación de que la intervención no constituye gasto corriente ni oculta un proyecto integral", 3, "1.1"),
                ("2", "FASE 2: CLASIFICACIÓN DE TIPOLOGÍA IOARR Y VERIFICACIÓN DE TOPES", 4, "1"),
                ("2.1", "Clasificación de tipología (optimización, reposición, rehabilitación o ampliación marginal)", 2, "1.2"),
                ("2.2", "Verificación de que los activos pertenezcan a los factores de producción de la Unidad Productora IMARPE", 2, "2.1"),
                ("3", "FASE 3: REGISTRO ELECTRÓNICO EN EL BANCO DE INVERSIONES", 3, "2"),
                ("3.1", "Llenado de datos y carga de información en el aplicativo del Formato N° 05-B en el Banco de Inversiones", 2, "2.2"),
                ("3.2", "Suscripción digital del Formato N° 05-B por el jefe de la Unidad Formuladora de la OPPM", 1, "3.1")
            ]
        ),
        (
            "Formulación, Evaluación y Declaración de Viabilidad de Proyectos de Inversión CTI (UF)",
            "Gestión de inversiones públicas (Unidad Formuladora) (S3.4)",
            "Elaboración de estudio de preinversión o ficha técnica CTI, evaluación social y registro del Formato N° 07-A.",
            [
                ("1", "FASE 1: ACTUACIONES PRELIMINARES Y SANEAMIENTO FÍSICO-LEGAL", 15, ""),
                ("1.1", "Elaboración de TDR para contratación de consultoría de formulación o asignación al formulador de la OPPM", 4, ""),
                ("1.2", "Aplicación del test de complejidad (Anexo N° 10) para definir el documento técnico (FTS, FTByM o Perfil)", 3, "1.1"),
                ("1.3", "Verificación y acreditación del saneamiento físico-legal o disponibilidad física del predio (Art. 24.9)", 8, "1.2"),
                ("2", "FASE 2: FORMULACIÓN TÉCNICA Y ECONÓMICA BAJO GUÍA CTI", 45, "1"),
                ("2.1", "Diagnóstico multidimensional del área de influencia, población demandante y Unidad Productora", 12, "1.3"),
                ("2.2", "Definición del problema central, causas y efectos, árbol de objetivos y medios fundamentales", 6, "2.1"),
                ("2.3", "Estimación y proyección de la brecha oferta-demanda de servicios científicos y tecnológicos marinos", 8, "2.2"),
                ("2.4", "Análisis técnico: dimensionamiento para portafolio I+D+i, opciones de localización y tecnología", 10, "2.3"),
                ("2.5", "Estimación de costos de inversión a precios de mercado y costos de operación y mantenimiento incremental", 5, "2.4"),
                ("2.6", "Evaluación social (flujos de beneficios y costos a precios sociales, VANS o Costo-Efectividad)", 4, "2.5"),
                ("3", "FASE 3: EVALUACIÓN FORMAL Y DECLARATORIA DE VIABILIDAD", 14, "2"),
                ("3.1", "Control de no duplicación aplicando la técnica de consulta avanzada en el Banco de Inversiones", 2, "2.6"),
                ("3.2", "Emisión del Informe Técnico de Evaluación y Viabilidad suscrito por el equipo técnico de la UF", 6, "3.1"),
                ("3.3", "Registro y transmisión del Formato N° 07-A en el Banco de Inversiones con carga del estudio y resumen", 3, "3.2"),
                ("3.4", "Comunicación formal de viabilidad y entrega de carpeta técnica a la Unidad Ejecutora de Inversiones (OGA)", 3, "3.3")
            ]
        ),
        (
            "Identificación, Sustento Técnico y Aprobación de IOARR (Formato 07-C)",
            "Gestión de inversiones públicas (Unidad Formuladora) (S3.4)",
            "Elaboración de informe técnico de IOARR, verificación de activos estratégicos, vida útil y aprobación en Banco de Inversiones.",
            [
                ("1", "FASE 1: DIAGNÓSTICO SITUACIONAL Y SUSTENTO DE CAUSALES", 8, ""),
                ("1.1", "Revisión de bitácoras de fallas, informes de inoperatividad o fin de vida útil de activos estratégicos", 3, ""),
                ("1.2", "Verificación de que los activos a intervenir figuren en el listado de activos estratégicos de la UP IMARPE", 2, "1.1"),
                ("1.3", "Cotejo de límites normativos: incremento de capacidad menor a 20% o costo menor a topes directiva", 3, "1.2"),
                ("2", "FASE 2: FORMULACIÓN TÉCNICA Y COTIZACIÓN DE ACTIVOS", 10, "1"),
                ("2.1", "Determinación de especificaciones técnicas del equipamiento científico o infraestructura a reponer", 4, "1.3"),
                ("2.2", "Indagación de precios y elaboración de la estructura de costos referenciales de la IOARR", 3, "2.1"),
                ("2.3", "Estimación del cronograma tentativo de ejecución física y presupuestal", 3, "2.2"),
                ("3", "FASE 3: APROBACIÓN Y REGISTRO EN EL BANCO DE INVERSIONES", 6, "2"),
                ("3.1", "Elaboración y visación del Informe Técnico de Aprobación de IOARR por el equipo de la UF", 3, "2.3"),
                ("3.2", "Registro y suscripción del Formato N° 07-C en el Banco de Inversiones con carga del informe y cotizaciones", 2, "3.1"),
                ("3.3", "Notificación de la aprobación a la OGA (UEI) para la programación de su ejecución física", 1, "3.2")
            ]
        ),
        (
            "Evaluación de Consistencia Técnica entre el Expediente Técnico y la Viabilidad (Formato 08 Sección A)",
            "Gestión de inversiones públicas (Unidad Formuladora) (S3.4)",
            "Verificación obligatoria a cargo de la UF de que el Expediente Técnico no modifique la concepción técnica de la inversión.",
            [
                ("1", "FASE 1: RECEPCIÓN Y COTEJO DOCUMENTAL", 4, ""),
                ("1.1", "Recepción formal del expediente técnico definitivo y solicitud de consistencia remitida por la UEI", 1, ""),
                ("1.2", "Extracción del estudio de preinversión o ficha técnica viable y formatos de registro desde el BI", 1, "1.1"),
                ("1.3", "Cotejo preliminar de metas físicas, metrados y localización geográfica del proyecto", 2, "1.2"),
                ("2", "FASE 2: EVALUACIÓN DE CONCEPCIÓN TÉCNICA Y MONTO", 6, "1"),
                ("2.1", "Análisis técnico validando que no se altere el objetivo, tecnología ni capacidad de producción", 3, "1.3"),
                ("2.2", "Evaluación de variaciones presupuestales del valor referencial final y verificación de rentabilidad social", 3, "2.1"),
                ("3", "FASE 3: REGISTRO EN EL BANCO DE INVERSIONES Y RESPUESTA", 4, "2"),
                ("3.1", "Emisión del Informe Técnico de Consistencia Técnica suscrito por la jefatura de la OPPM (UF)", 2, "2.2"),
                ("3.2", "Llenado y transmisión del Formato N° 08-A o Formato N° 08-C Sección A en el Banco de Inversiones", 1, "3.1"),
                ("3.3", "Devolución oficial de actuados a la Oficina de Administración (UEI) para proceder a la aprobación del ET", 1, "3.2")
            ]
        ),

        # --- BLOQUE 3: FINANZAS, TESORERÍA, CONTABILIDAD Y CONTROL INSTITUCIONAL ---
        (
            "Determinación, Recaudación y Depósito de Fondos Públicos (TUSNE y Otros)",
            "Gestión de tesorería y endeudamiento público (S3.2)",
            "Facturación y cobranza de servicios tecnológicos, registro en SIAF y depósito en subcuenta CUT en plazo de 24 horas.",
            [
                ("1", "FASE 1: DETERMINACIÓN DEL INGRESO Y FACTURACIÓN", 3, ""),
                ("1.1", "Liquidación de derechos y tarifas por ensayos de laboratorio o servicios según tarifario TUSNE", 1, ""),
                ("1.2", "Emisión de comprobante de pago electrónico institucional (factura o boleta) en sistema de cobranza", 1, "1.1"),
                ("1.3", "Registro de la fase de determinación del ingreso en el módulo administrativo del SIAF-SP/RP", 1, "1.2"),
                ("2", "FASE 2: PERCEPCIÓN Y DEPÓSITO EN CUENTA ÚNICA DEL TESORO (CUT)", 2, "1"),
                ("2.1", "Cobranza de fondos en ventanilla, transferencias electrónicas o depósito en cuentas recaudadoras", 1, "1.3"),
                ("2.2", "Depósito íntegro en subcuentas bancarias de la CUT dentro del plazo perentorio de 24 horas", 1, "2.1"),
                ("3", "FASE 3: REGISTRO DE RECAUDACIÓN Y CONCILIACIÓN BANCARIA", 3, "2"),
                ("3.1", "Registro y transmisión de la fase de recaudado en el SIAF-SP/RP con papeleta T-6", 1, "2.2"),
                ("3.2", "Conciliación de reportes de recaudación diaria con extractos bancarios del Banco de la Nación", 2, "3.1")
            ]
        ),
        (
            "Control Previo y Formalización del Gasto Devengado (Directiva N° 001-2024-EF/52.01)",
            "Gestión de tesorería y endeudamiento público (S3.2)",
            "Verificación documental de la prestación, cumplimiento contractual y registro del devengado en el SIAF.",
            [
                ("1", "FASE 1: CONTROL PREVIO Y VERIFICACIÓN DE REQUISITOS", 3, ""),
                ("1.1", "Recepción de expediente de pago conteniendo orden de compra/servicio o contrato y factura", 1, ""),
                ("1.2", "Cotejo formal de conformidad técnica emitida por el área usuaria y NEA de almacén si corresponde", 1, "1.1"),
                ("1.3", "Verificación de validación de comprobante de pago electrónico en portal SUNAT y vigencia de RNP", 1, "1.2"),
                ("2", "FASE 2: VERIFICACIÓN PRESUPUESTAL Y REGISTRO EN SIAF", 2, "1"),
                ("2.1", "Control de registro previo del compromiso anual y mensual vigente en la cadena presupuestal", 1, "1.3"),
                ("2.2", "Registro y transmisión electrónica de la fase de devengado en el módulo administrativo SIAF-SP/RP", 1, "2.1"),
                ("3", "FASE 3: VALIDACIÓN Y REMISIÓN AL ÁREA DE PAGADURÍA", 2, "2"),
                ("3.1", "Verificación del estado de aprobación oficial del devengado por la Dirección General del Tesoro", 1, "2.2"),
                ("3.2", "Numeración y remisión del expediente devengado para programación y pago electrónico", 1, "3.1")
            ]
        ),
        (
            "Programación de Calendario de Pago y Gestión de Giros Electrónicos (CUT)",
            "Gestión de tesorería y endeudamiento público (S3.2)",
            "Programación de flujo de caja, asignación financiera DGTP, giro SIAF y transferencia interbancaria CCI a proveedores.",
            [
                ("1", "FASE 1: PROGRAMACIÓN DE CAJA Y SOLICITUD DE ASIGNACIÓN", 3, ""),
                ("1.1", "Elaboración de la programación de pagos semanal priorizando vencimientos y contrataciones", 1, ""),
                ("1.2", "Solicitud y seguimiento de asignaciones financieras ante la DGTP-MEF en la subcuenta de gasto CUT", 2, "1.1"),
                ("2", "FASE 2: REGISTRO DEL GIRO Y RETENCIONES TRIBUTARIAS", 3, "1"),
                ("2.1", "Cálculo de detracciones del SPOT, retenciones de IGV o Renta y penalidades aplicables", 1, "1.2"),
                ("2.2", "Generación y transmisión electrónica de la fase de giro en el SIAF-SP/RP con tipo de pago electrónico", 1, "2.1"),
                ("2.3", "Aprobación oficial del giro por la Dirección General del Tesoro Público", 1, "2.2"),
                ("3", "FASE 3: TRANSFERENCIA BANCARIA Y EMISIÓN DE COMPROBANTE", 2, "2"),
                ("3.1", "Autorización electrónica mancomunada de transferencias en el sistema de pagos del Banco de la Nación", 1, "2.3"),
                ("3.2", "Emisión del comprobante de pago institucional y archivo de constancia de abono en cuenta CCI", 1, "3.1")
            ]
        ),
        (
            "Apertura, Ejecución, Rendición y Reembolso del Fondo Fijo de Caja Chica",
            "Gestión de tesorería y endeudamiento público (S3.2)",
            "Administración de fondos para gastos menudos y urgentes, arqueos inopinados y liquidación en SIAF.",
            [
                ("1", "FASE 1: CONSTITUCIÓN Y APERTURA RESOLUTIVA", 5, ""),
                ("1.1", "Emisión de resolución de la Oficina de Administración autorizando apertura del fondo y designando custodio", 2, ""),
                ("1.2", "Certificación presupuestal, compromiso, devengado y giro de apertura en el SIAF con cheque o abono", 3, "1.1"),
                ("2", "FASE 2: ATENCIÓN DE GASTOS Y ARQUEOS INOPINADOS", 8, "1"),
                ("2.1", "Recepción de vales provisionales justificados para gastos menudos y urgentes no programables", 2, "1.2"),
                ("2.2", "Rendición documentaria del gasto con boletas o facturas dentro del plazo de 48 horas", 3, "2.1"),
                ("2.3", "Ejecución de arqueos inopinados de fondos por el responsable de tesorería y suscripción de actas", 3, "2.2"),
                ("3", "FASE 3: REPOSICIÓN Y LIQUIDACIÓN ANUAL", 6, "2"),
                ("3.1", "Consolidación de rendiciones en planilla de gastos de caja chica para solicitud de reembolso", 2, "2.3"),
                ("3.2", "Giro de reposición en SIAF cuando el gasto alcanza el porcentaje normativo fijado en directiva", 2, "3.1"),
                ("3.3", "Liquidación total de fin de ejercicio con devolución de saldo no ejecutado con papeleta T-6", 2, "3.2")
            ]
        ),
        (
            "Gestión de Pasivos Financieros, Servicio de Deuda y Endeudamiento Público",
            "Gestión de tesorería y endeudamiento público (S3.2)",
            "Administración de convenios de traspaso de recursos, pago de cuotas de deuda pública y conciliación con DGTP.",
            [
                ("1", "FASE 1: TRAMITACIÓN DE RECURSOS DE ENDEUDAMIENTO", 12, ""),
                ("1.1", "Revisión de convenios de traspaso de recursos para financiamiento de proyectos científicos o naves", 5, ""),
                ("1.2", "Solicitud y trámite de desembolsos de fondos de operaciones oficiales de crédito ante la DGTP-MEF", 4, "1.1"),
                ("1.3", "Apertura y registro de subcuentas bancarias específicas en el SIAF para control de fondos", 3, "1.2"),
                ("2", "FASE 2: PROGRAMACIÓN Y ATENCIÓN DEL SERVICIO DE LA DEUDA", 9, "1"),
                ("2.1", "Actualización de tablas de amortización de capital, intereses, comisiones y gastos financieros", 3, "1.3"),
                ("2.2", "Certificación y afectación presupuestal del servicio de la deuda en la genérica correspondiente", 3, "2.1"),
                ("2.3", "Devengado y giro para pago de cuotas del cronograma establecido en los convenios de endeudamiento", 3, "2.2"),
                ("3", "FASE 3: CONCILIACIÓN SEMESTRAL DE PASIVOS", 9, "2"),
                ("3.1", "Conciliación de saldos de deuda y pasivos contingentes al cierre semestral (30 de junio y 31 de diciembre)", 4, "2.3"),
                ("3.2", "Registro y transmisión del saldo en el Módulo de Deuda del SIAF ante la Dirección General del Tesoro", 3, "3.1"),
                ("3.3", "Suscripción del acta de conciliación de endeudamiento público institucional", 2, "3.2")
            ]
        ),
        (
            "Registro Sistemático de Operaciones y Conciliaciones Contables Mensuales",
            "Gestión contable institucional (S3.3)",
            "Causación contable en SIAF-RP, conciliaciones bancarias, almacén y patrimonio, y emisión de balances.",
            [
                ("1", "FASE 1: CONTABILIZACIÓN DE HECHOS ECONÓMICOS", 6, ""),
                ("1.1", "Revisión documental y contabilización de ingresos recaudados y depósitos en la CUT", 2, ""),
                ("1.2", "Contabilización patrimonial de gastos devengados y pagos ejecutados según Tabla de Operaciones", 2, "1.1"),
                ("1.3", "Registro contable de adquisiciones de existencias de almacén y bienes de capital", 2, "1.2"),
                ("2", "FASE 2: CONCILIACIONES INTERNAS Y EXTRACTOS BANCARIOS", 8, "1"),
                ("2.1", "Conciliación mensual de subcuentas bancarias con extractos del Banco de la Nación e informes de tesorería", 3, "1.3"),
                ("2.2", "Conciliación mensual de ingresos y salidas valorizadas con el responsable del Almacén Central (SIGA)", 3, "2.1"),
                ("2.3", "Cotejo mensual de altas, bajas y transferencias patrimoniales con Control Patrimonial", 2, "2.2"),
                ("3", "FASE 3: CIERRE MENSUAL Y EMISIÓN DE BALANCE DE COMPROBACIÓN", 6, "2"),
                ("3.1", "Elaboración de notas de contabilidad para ajustes, devengados contables y depreciación de activos", 2, "2.3"),
                ("3.2", "Generación y revisión del Balance de Comprobación preliminar mensual en el aplicativo SIAF-RP", 2, "3.1"),
                ("3.3", "Cierre contable mensual y archivo cronológico de carpetas de comprobantes de pago", 2, "3.2")
            ]
        ),
        (
            "Elaboración de Estados Financieros, Presupuestarios y Cuenta General de la República",
            "Gestión contable institucional (S3.3)",
            "Formulación de estados financieros bajo NIC-SP, notas explicativas y rendición de cuentas anual ante DGCP-MEF.",
            [
                ("1", "FASE 1: OPERACIONES DE CIERRE Y AJUSTES CONTABLES DE FIN DE AÑO", 15, ""),
                ("1.1", "Suscripción de actas de conciliación patrimonio-contable y almacén-contabilidad de cierre fiscal", 5, ""),
                ("1.2", "Cálculo y registro de la depreciación acumulada de propiedades, planta y equipo y amortización de intangibles", 4, "1.1"),
                ("1.3", "Cálculo actuarial de provisiones de beneficios sociales y contingencias de litigios en contra del pliego", 3, "1.2"),
                ("1.4", "Suscripción del acta de conciliación del marco legal y ejecución del presupuesto con la OPPM", 3, "1.3"),
                ("2", "FASE 2: FORMULACIÓN DE ESTADOS FINANCIEROS Y NOTAS BAJO NIC-SP", 15, "1"),
                ("2.1", "Elaboración del Estado de Situación Financiera (EF-1) y Estado de Gestión (EF-2)", 5, "1.4"),
                ("2.2", "Elaboración del Estado de Cambios en el Patrimonio Neto (EF-3) y Estado de Flujos de Efectivo (EF-4)", 4, "2.1"),
                ("2.3", "Estructuración de Estados Presupuestarios (EP-1 Estado de Ejecución del Presupuesto y anexos)", 3, "2.2"),
                ("2.4", "Redacción de las notas explicativas a los estados financieros revelando hechos materiales", 3, "2.3"),
                ("3", "FASE 3: TRANSMISIÓN ELECTRÓNICA Y AUDITORÍA FINANCIERA", 15, "2"),
                ("3.1", "Transmisión y presentación de la rendición anual a la DGCP-MEF a más tardar el 15 de marzo", 3, "2.4"),
                ("3.2", "Atención a la Sociedad de Auditoría designada por la CGR durante la auditoría financiera anual", 8, "3.1"),
                ("3.3", "Recepción del dictamen de auditoría financiera e implementación del plan de recomendaciones", 4, "3.2")
            ]
        ),
        (
            "Implementación y Evaluación del Sistema de Control Interno (SCI)",
            "Control de la gestión institucional (E3)",
            "Diagnóstico de cultura organizacional, gestión de riesgos operativos y reporte semestral en el aplicativo de CGR.",
            [
                ("1", "FASE 1: DIAGNÓSTICO DE LA CULTURA ORGANIZACIONAL Y CAPACITACIÓN", 10, ""),
                ("1.1", "Aplicación de encuestas de evaluación del ambiente de control al personal del IMARPE", 4, ""),
                ("1.2", "Tabulación de resultados y elaboración del diagnóstico situacional de cultura organizacional", 3, "1.1"),
                ("1.3", "Formulación del plan de acción anual de medidas de remediación y aprobación por gerencia general", 3, "1.2"),
                ("2", "FASE 2: GESTIÓN DE RIESGOS OPERATIVOS EN PROCESOS INSTITUCIONALES", 15, "1"),
                ("2.1", "Talleres de identificación de riesgos de interrupción o fraude en procesos clave y soporte", 5, "1.3"),
                ("2.2", "Valoración de probabilidad e impacto, determinación del riesgo residual y diseño de controles", 5, "2.1"),
                ("2.3", "Formulación del plan de acción anual de medidas de control para mitigar riesgos prioritarios", 5, "2.2"),
                ("3", "FASE 3: REGISTRO Y REPORTE SEMESTRAL ANTE CGR", 10, "2"),
                ("3.1", "Recolección de medios probatorios del avance de medidas de remediación y control en áreas", 4, "2.3"),
                ("3.2", "Carga y registro del reporte semestral en el aplicativo del Sistema de Control Interno de CGR", 3, "3.1"),
                ("3.3", "Suscripción del reporte por el titular del pliego y notificación a la Contraloría General", 3, "3.2")
            ]
        ),
        (
            "Seguimiento de Servicios de Control Gubernamental (OCI y CGR)",
            "Control de la gestión institucional (E3)",
            "Atención de servicios de control simultáneo y posterior, formulación de planes y respuesta a informes de auditoría.",
            [
                ("1", "FASE 1: RECEPCIÓN Y GESTIÓN DE INFORMES DE CONTROL", 5, ""),
                ("1.1", "Recepción y registro de informe de visita de control, hito de control simultáneo o auditoría posterior", 1, ""),
                ("1.2", "Derivación inmediata a las unidades orgánicas competentes y fijación de plazos perentorios de respuesta", 2, "1.1"),
                ("1.3", "Consolidación de requerimientos de información formulados por la comisión auditora del OCI", 2, "1.2"),
                ("2", "FASE 2: FORMULACIÓN DE PLANES DE ACCIÓN Y MEDIDAS CORRECTIVAS", 12, "1"),
                ("2.1", "Elaboración de planes de acción para mitigación de situaciones adversas comunicadas en control simultáneo", 4, "1.3"),
                ("2.2", "Elaboración del plan de implementación de recomendaciones de informes de control posterior (auditorías)", 5, "2.1"),
                ("2.3", "Aprobación del plan de implementación de recomendaciones mediante resolución de gerencia general", 3, "2.2"),
                ("3", "FASE 3: SEGUIMIENTO, CARGA EN APLICATIVO Y CIERRE", 10, "2"),
                ("3.1", "Monitoreo continuo y recolección de evidencias sobre el cumplimiento de acciones correctivas", 5, "2.3"),
                ("3.2", "Registro y actualización del estado de recomendaciones en el aplicativo informático SAGU de la CGR", 3, "3.1"),
                ("3.3", "Emisión del informe semestral de seguimiento y remisión de actuados al Órgano de Control Institucional", 2, "3.2")
            ]
        ),
        (
            "Implementación del Modelo de Integridad y Lucha Contra la Corrupción",
            "Control de la gestión institucional (E3)",
            "Evaluación del índice de capacidad preventiva, trámite de denuncias, mitigación de conflictos de interés y ética.",
            [
                ("1", "FASE 1: PLANIFICACIÓN Y MEDICIÓN DEL ÍNDICE DE INTEGRIDAD", 8, ""),
                ("1.1", "Evaluación del Índice de Capacidad Preventiva (ICP) institucional conforme al estándar de la SIP-PCM", 3, ""),
                ("1.2", "Elaboración del Programa de Integridad Anual conteniendo componentes y acciones de fortalecimiento", 3, "1.1"),
                ("1.3", "Emisión de resolución de gerencia general que aprueba el programa anual de integridad del IMARPE", 2, "1.2"),
                ("2", "FASE 2: GESTIÓN DE RIESGOS DE CORRUPCIÓN Y CONFLICTOS DE INTERÉS", 12, "1"),
                ("2.1", "Mapeo y actualización de la matriz de riesgos que afectan la integridad pública en compras e investigación", 4, "1.3"),
                ("2.2", "Verificación y fiscalización de presentación de declaraciones juradas de intereses (DJI) ante la CGR", 4, "2.1"),
                ("2.3", "Ejecución de campañas internas sobre ética pública, neutralidad y directiva de regalos e incentivos", 4, "2.2"),
                ("3", "FASE 3: ATENCIÓN DE DENUNCIAS Y REPORTE SIP", 10, "2"),
                ("3.1", "Recepción y custodia en canal de denuncias de presuntos actos de corrupción (plataforma digital)", 2, "2.3"),
                ("3.2", "Evaluación preliminar de admisibilidad y otorgamiento de medidas de protección al denunciante", 5, "3.1"),
                ("3.3", "Elaboración y reporte periódico del informe de cumplimiento del modelo de integridad a la SIP-PCM", 3, "3.2")
            ]
        )
    ]

    # Asegurar que la columna es_oficial exista en la tabla plantillas
    cols_p = [col[1] for col in c.execute("PRAGMA table_info(plantillas)").fetchall()]
    if "es_oficial" not in cols_p:
        c.execute("ALTER TABLE plantillas ADD COLUMN es_oficial INTEGER DEFAULT 1")

    mapeo_subproceso_exacto = {
        "Programación Multianual de Bienes, Servicios y Obras (Fase de Identificación del CMN)": "S2.1",
        "Consolidación, Aprobación y Modificación del Cuadro Multianual de Necesidades (CMN)": "S2.1",
        "Elaboración, Aprobación y Seguimiento del Plan Anual de Contrataciones (PAC)": "S2.1",
        "Licitación Pública / Concurso Público de Bienes, Servicios y Obras": "S2.2.1",
        "Licitación Abreviada y Concurso Abreviado": "S2.2.2",
        "Comparación de Precios y Subasta Inversa Electrónica": "S2.2.4",
        "Contratación Menor a 8 UIT (Compras Menores no Sujetas a Procedimiento)": "S2.2.3",
        "Ejecución Contractual, Modificaciones Contractuales y Liquidación": "S2.2.6",
        "Almacenamiento, Recepción e Internamiento de Bienes Muebles": "S2.3.1",
        "Distribución, Despacho y Transporte de Bienes a Sedes Desconcentradas": "S2.3.2",
        "Inventario Físico Masivo Anual de Existencias de Almacén": "S2.3.3",
        "Gestión Patrimonial: Alta, Codificación y Asignación de Bienes Muebles": "S2.3.4",
        "Gestión Patrimonial: Baja y Disposición Final de Bienes Muebles (RAEE y Ordinarios)": "S2.3.5",
        "Inventario Físico Anual de Bienes Patrimoniales Muebles e Inmuebles": "S2.3.6",
        "Planificación y Contratación del Aseguramiento de Bienes Muebles e Inmuebles": "S2.3.7",
        "Mantenimiento Preventivo y Correctivo de la Flota Vehicular Terrestre": "S2.4.1",
        "Mantenimiento de Infraestructura Física, Instalaciones y Servicios Generales": "S2.4.2",
        "Elaboración y Aprobación de Expedientes Técnicos y Documentos Equivalentes (UEI)": "S2.5.1",
        "Ejecución Física, Supervisión de Obra y Control en INFOBRAS (UEI)": "S2.5.2",
        "Liquidación Técnica-Financiera, Cierre y Transferencia de Inversiones (Formato 09)": "S2.5.3",
        "Formulación y Actualización del Plan Estratégico Institucional (PEI)": "E1.2",
        "Elaboración y Aprobación del Plan Operativo Institucional (POI) Multianual": "E1.3",
        "Consistencia del POI Anual con el Presupuesto Institucional de Apertura (PIA)": "E1.3",
        "Seguimiento y Evaluación Periódica del POI y PEI (Trimestral / Semestral / Anual)": "E1.3",
        "Diseño, Mantenimiento y Aprobación del Mapa de Procesos Institucional (MPI)": "E2.1.2",
        "Despliegue de Procesos a Nivel 1, 2 y 3 (Fichas de Proceso y Matriz SIPOC)": "E2.1.2",
        "Elaboración y Aprobación de Documentos Normativos Institucionales (Directivas y Procedimientos)": "E2.1.3",
        "Mantenimiento y Auditoría del Sistema de Gestión Integrado (ISO 9001 / ISO 37001)": "E2.2.9",
        "Programación Multianual Presupuestaria y Formulación del Presupuesto Institucional": "S3.1.1",
        "Aprobación y Desagregación del Presupuesto Institucional de Apertura (PIA)": "S3.1.2",
        "Gestión de Modificaciones Presupuestarias en el Nivel Funcional y Programático": "S3.1.3",
        "Gestión de Certificaciones de Crédito Presupuestario (CCP) y Previsiones": "S3.1.4",
        "Evaluación Semestral y Anual de la Ejecución Presupuestaria": "S3.1.5",
        "Diagnóstico Institucional de Brechas y Criterios de Priorización de Inversiones (UF)": "S3.4.1",
        "Identificación y Registro de Ideas de Proyectos de Inversión y Programas (Formato 05-A)": "S3.4.2",
        "Identificación y Registro Agregado de Ideas de IOARR (Formato 05-B)": "S3.4.3",
        "Formulación, Evaluación y Declaración de Viabilidad de Proyectos de Inversión CTI (UF)": "S3.4.4",
        "Identificación, Sustento Técnico y Aprobación de IOARR (Formato 07-C)": "S3.4.5",
        "Evaluación de Consistencia Técnica entre el Expediente Técnico y la Viabilidad (Formato 08 Sección A)": "S3.4.6",
        "Determinación, Recaudación y Depósito de Fondos Públicos (TUSNE y Otros)": "S3.2.1",
        "Control Previo y Formalización del Gasto Devengado (Directiva N° 001-2024-EF/52.01)": "S3.2.2",
        "Programación de Calendario de Pago y Gestión de Giros Electrónicos (CUT)": "S3.2.3",
        "Apertura, Ejecución, Rendición y Reembolso del Fondo Fijo de Caja Chica": "S3.2.4",
        "Gestión de Pasivos Financieros, Servicio de Deuda y Endeudamiento Público": "S3.2.5",
        "Registro Sistemático de Operaciones y Conciliaciones Contables Mensuales": "S3.3.1",
        "Elaboración de Estados Financieros, Presupuestarios y Cuenta General de la República": "S3.3.2",
        "Implementación y Evaluación del Sistema de Control Interno (SCI)": "E3.1",
        "Seguimiento de Servicios de Control Gubernamental (OCI y CGR)": "E3.2",
        "Implementación del Modelo de Integridad y Lucha Contra la Corrupción": "E3.3"
    }

    filas_proc = c.execute("SELECT codigo, nombre FROM procesos_institucionales").fetchall()
    dict_procesos = {r[0]: f"{r[0]} - {r[1]}" for r in filas_proc}

    import re

    # Siglas y nombres propios oficiales que SÍ deben mantener su mayúscula en español
    EXCEPCIONES_MAYUSCULA = {
        "IMARPE": "IMARPE", "PRODUCE": "PRODUCE", "CEPLAN": "CEPLAN", "MEF": "MEF",
        "DGPP": "DGPP", "DGTP": "DGTP", "DGCP": "DGCP", "DGA": "DGA", "CGR": "CGR",
        "OCI": "OCI", "PCM": "PCM", "SGP": "SGP", "SIP": "SIP", "SUNAT": "SUNAT",
        "SEACE": "SEACE", "SIGA": "SIGA", "SIAF": "SIAF", "RNP": "RNP", "CUT": "CUT",
        "TUSNE": "TUSNE", "SPOT": "SPOT", "IGV": "IGV", "CCI": "CCI", "NIC": "NIC",
        "SP": "SP", "RP": "RP", "SCI": "SCI", "SAGU": "SAGU", "ICP": "ICP", "DJI": "DJI",
        "PEI": "PEI", "POI": "POI", "PIA": "PIA", "PESEM": "PESEM", "OEI": "OEI",
        "AEI": "AEI", "OPPM": "OPPM", "OGA": "OGA", "OGAJ": "OGAJ", "OTI": "OTI",
        "MPI": "MPI", "ROF": "ROF", "BPMN": "BPMN", "BPM": "BPM", "SIPOC": "SIPOC",
        "SGI": "SGI", "ISO": "ISO", "APM": "APM", "PPR": "PpR", "CMN": "CMN",
        "PAC": "PAC", "PMBSO": "PMBSO", "CUBSO": "CUBSO", "UIT": "UIT", "TDR": "TDR",
        "NEA": "NEA", "PECOSA": "PECOSA", "SNA": "SNA", "RAEE": "RAEE", "ITSE": "ITSE",
        "UEI": "UEI", "UF": "UF", "UP": "UP", "CTI": "CTI", "OPMI": "OPMI", "PMI": "PMI",
        "IOARR": "IOARR", "BI": "BI", "FTS": "FTS", "FTBYM": "FTByM", "VANS": "VANS",
        "ET": "ET", "BIM": "BIM", "PIM": "PIM", "INFOBRAS": "INFOBRAS", "WBS": "WBS",
        "EDT": "EDT", "TI": "TI", "N°": "N°",
        # Nombres propios o entidades con inicial mayúscula
        "Pladicop": "Pladicop", "Estado": "Estado", "República": "República",
        "Cuenta": "Cuenta", "General": "General", "Banco": "Banco", "Inversiones": "Inversiones",
        "Formato": "Formato", "Directiva": "Directiva", "Ley": "Ley", "Anexo": "Anexo",
        "Sección": "Sección", "Fase": "Fase", "Unidad": "Unidad", "Formuladora": "Formuladora"
    }

    MAPA_UPPER = {k.upper(): v for k, v in EXCEPCIONES_MAYUSCULA.items()}

    def normalizar_titulo_espanol(texto: str) -> str:
        if not texto:
            return ""
        def reemplazar_palabra(match):
            palabra = match.group(0)
            inicio = match.start()
            pal_upper = palabra.upper()
            if pal_upper in MAPA_UPPER:
                return MAPA_UPPER[pal_upper]
            # Si es la primera palabra del título o va justo después de ": " o "(", mantiene inicial mayúscula
            prefijo_inmediato = texto[max(0, inicio - 2):inicio]
            if inicio == 0 or prefijo_inmediato.endswith(": ") or prefijo_inmediato.endswith("("):
                return palabra[0].upper() + palabra[1:].lower()
            return palabra.lower()

        return re.sub(r'[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9°]+', reemplazar_palabra, texto)

    def resolver_categoria_oficial(nombre_plantilla_orig: str, cat_bruta: str) -> str:
        cod_exacto = mapeo_subproceso_exacto.get(nombre_plantilla_orig)
        if cod_exacto and cod_exacto in dict_procesos:
            return dict_procesos[cod_exacto]
        m = re.search(r'\(([EMS]\d+(?:\.\d+)*)\)', cat_bruta or "")
        if not m:
            m = re.match(r'^([EMS]\d+(?:\.\d+)*)', (cat_bruta or "").strip())
        if m:
            cod = m.group(1)
            if cod in dict_procesos:
                return dict_procesos[cod]
        return cat_bruta

    total_creadas = 0
    total_actualizadas = 0

    for p_nom_orig, p_cat, p_desc, acts in plantillas_consolidadas:
        p_nom_esp = normalizar_titulo_espanol(p_nom_orig)
        cat_oficial = resolver_categoria_oficial(p_nom_orig, p_cat)

        # Buscar tanto por el nombre original (en Title Case) como por el ya corregido en español
        p_row = c.execute(
            "SELECT id FROM plantillas WHERE nombre = ? OR nombre = ?",
            (p_nom_orig, p_nom_esp)
        ).fetchone()

        if p_row:
            p_id = p_row[0]
            c.execute("""
                UPDATE plantillas 
                SET nombre = ?, descripcion = ?, categoria = ?, es_oficial = 1 
                WHERE id = ?
            """, (p_nom_esp, p_desc, cat_oficial, p_id))
            c.execute("DELETE FROM plantillas_actividades WHERE plantilla_id = ?", (p_id,))
            total_actualizadas += 1
        else:
            c.execute("""
                INSERT INTO plantillas (nombre, descripcion, categoria, creador_id, es_oficial) 
                VALUES (?, ?, ?, ?, 1)
            """, (p_nom_esp, p_desc, cat_oficial, admin_id))
            p_id = c.lastrowid
            total_creadas += 1

        for cod, desc, dias, pred in acts:
            c.execute("""
                INSERT INTO plantillas_actividades (plantilla_id, codigo, descripcion, dias, predecesores)
                VALUES (?, ?, ?, ?, ?)
            """, (p_id, cod, desc, dias, pred))

    otras_plantillas = c.execute("SELECT id, nombre, categoria, creador_id FROM plantillas").fetchall()
    for op_id, op_nom, op_cat, op_creador in otras_plantillas:
        nom_corregido = normalizar_titulo_espanol(op_nom)
        nueva_cat = resolver_categoria_oficial(op_nom, op_cat or "")
        es_of = 1 if (op_creador == admin_id or op_creador is None) else 0
        c.execute(
            "UPDATE plantillas SET nombre = ?, categoria = ?, es_oficial = COALESCE(es_oficial, ?) WHERE id = ?",
            (nom_corregido, nueva_cat, es_of, op_id)
        )

    conn.commit()
    print(f"✅ Sincronización exitosa: {total_creadas} plantillas nuevas y {total_actualizadas} actualizadas con ortografía en español.")