import sqlite3
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends
from app.database.connection import get_db
from app.core.security import get_current_user

router = APIRouter(tags=["Ruta Crítica CPM"])

def clave_wbs_natural(cod: str):
    return [int(p) if p.isdigit() else p for p in str(cod).rstrip(".").split(".")]

def parsear_fecha_cpm(f_str: str) -> Optional[date]:
    if not f_str:
        return None
    s = str(f_str).strip().split("T")[0]
    try:
        if "/" in s:
            p = s.split("/")
            if len(p) == 3:
                return date(int(p[2]), int(p[1]), int(p[0])) if len(p[0]) <= 2 else date(int(p[0]), int(p[1]), int(p[2]))
        elif "-" in s:
            p = s.split("-")
            if len(p) == 3:
                return date(int(p[0]), int(p[1]), int(p[2])) if len(p[0]) == 4 else date(int(p[2]), int(p[1]), int(p[0]))
    except Exception:
        return None
    return None

@router.get("/ruta-critica")
def calcular_cpm(proyecto_id: Optional[int] = 1, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    p_id = int(proyecto_id or 1)
    
    proy = db.execute("SELECT duration_mode, unidad_tiempo FROM proyectos WHERE id = ?", (p_id,)).fetchone()
    modo_duracion = "hours" if (proy and (proy["duration_mode"] == "hours" or proy["unidad_tiempo"] == "HORAS")) else "business_days"

    rows = db.execute("""
        SELECT codigo, descripcion, dias, predecesores, fecha_inicio, fecha_fin, estado, avance 
        FROM actividades 
        WHERE proyecto_id = ?
    """, (p_id,)).fetchall()

    if not rows:
        return {"duracion_proyecto_dias": 0, "modo_duracion": modo_duracion, "detalles": {}, "enlaces_efectivos": []}

    filas_ordenadas = sorted([dict(r) for r in rows], key=lambda x: clave_wbs_natural(x["codigo"]))
    todos_codigos = [str(r["codigo"]).rstrip(".") for r in filas_ordenadas]
    set_codigos = set(todos_codigos)

    actividades_dict = {}
    hijos_de_madre = {cod: [] for cod in todos_codigos}

    fechas_inicio_validas = []
    for r in filas_ordenadas:
        dt_i = parsear_fecha_cpm(r.get("fecha_inicio"))
        if dt_i:
            fechas_inicio_validas.append(dt_i)
    fecha_base_proy = min(fechas_inicio_validas) if fechas_inicio_validas else datetime.now().date()

    for r in filas_ordenadas:
        cod = str(r["codigo"]).rstrip(".")
        hijos = [otro for otro in todos_codigos if otro.startswith(f"{cod}.") and otro != cod]
        es_madre = len(hijos) > 0
        if es_madre:
            hijos_de_madre[cod] = hijos

        preds_raw = [p.strip().rstrip(".") for p in (r["predecesores"] or "").split(",") if p.strip()]
        preds_validos = [p for p in preds_raw if p in set_codigos and p != cod and not cod.startswith(f"{p}.")]

        dt_ini = parsear_fecha_cpm(r.get("fecha_inicio"))
        offset_calendario = max(0, (dt_ini - fecha_base_proy).days) if dt_ini else 0

        actividades_dict[cod] = {
            "codigo": cod,
            "descripcion": r["descripcion"],
            "duracion": max(1, int(r["dias"] or 1)),
            "offset_calendario": offset_calendario,
            "predecesores_originales": preds_validos,
            "predecesores": list(preds_validos),
            "es_madre": es_madre,
            "ES": 0, "EF": 0, "LS": 0, "LF": 0, "holgura": 0, "es_critica": False
        }

    hojas_cods = [c for c in todos_codigos if not actividades_dict[c]["es_madre"]]
    if not hojas_cods:
        hojas_cods = todos_codigos

    def obtener_hojas_bajo_nodo(cod_nodo: str):
        if not actividades_dict[cod_nodo]["es_madre"]:
            return [cod_nodo]
        return [h for h in hijos_de_madre[cod_nodo] if not actividades_dict[h]["es_madre"]]

    nodos = {}
    for cod in hojas_cods:
        info = dict(actividades_dict[cod])
        preds_expandidos = set()

        partes = cod.split(".")
        for i in range(1, len(partes) + 1):
            ancestro = ".".join(partes[:i])
            if ancestro in actividades_dict:
                for p_anc in actividades_dict[ancestro]["predecesores_originales"]:
                    for hoja_pred in obtener_hojas_bajo_nodo(p_anc):
                        if hoja_pred != cod:
                            preds_expandidos.add(hoja_pred)

        info["predecesores"] = sorted(list(preds_expandidos), key=clave_wbs_natural)
        nodos[cod] = info

    def tiene_ciclo_dfs(actual, destino, visitando):
        if actual == destino:
            return True
        visitando.add(actual)
        for p in nodos[actual]["predecesores"]:
            if p in nodos and p not in visitando:
                if tiene_ciclo_dfs(p, destino, visitando):
                    return True
        return False

    for cod in hojas_cods:
        nodos[cod]["predecesores"] = [
            p for p in nodos[cod]["predecesores"]
            if p in nodos and not tiene_ciclo_dfs(p, cod, set())
        ]

    # Forward Pass Híbrido (Respeta tanto el empuje de las predecesoras como la fecha de inicio programada)
    for cod in hojas_cods:
        n = nodos[cod]
        n["ES"] = n["offset_calendario"] if not n["predecesores"] else 0
        n["EF"] = n["ES"] + n["duracion"]

    cambio = True
    iteraciones = 0
    max_iter = len(nodos) + 2
    while cambio and iteraciones < max_iter:
        cambio = False
        iteraciones += 1
        for cod in hojas_cods:
            n = nodos[cod]
            max_ef_pred = max((nodos[p]["EF"] for p in n["predecesores"] if p in nodos), default=n["offset_calendario"])
            nuevo_es = max(max_ef_pred, n["offset_calendario"] if not n["predecesores"] else max_ef_pred)
            nuevo_ef = nuevo_es + n["duracion"]
            if nuevo_es != n["ES"] or nuevo_ef != n["EF"]:
                n["ES"] = nuevo_es
                n["EF"] = nuevo_ef
                cambio = True

    duracion_total = max((n["EF"] for n in nodos.values()), default=0)

    # Backward Pass (Cálculo de LS y LF)
    for n in nodos.values():
        n["LF"] = duracion_total
        n["LS"] = max(0, duracion_total - n["duracion"])

    cambio = True
    iteraciones = 0
    while cambio and iteraciones < max_iter:
        cambio = False
        iteraciones += 1
        for cod in reversed(hojas_cods):
            n = nodos[cod]
            sucesores = [s for s in nodos.values() if cod in s["predecesores"]]
            if sucesores:
                min_ls_suc = min(s["LS"] for s in sucesores)
                nuevo_lf = min_ls_suc
                nuevo_ls = max(0, nuevo_lf - n["duracion"])
                if nuevo_lf != n["LF"] or nuevo_ls != n["LS"]:
                    n["LF"] = nuevo_lf
                    n["LS"] = nuevo_ls
                    cambio = True

    enlaces_efectivos = []
    for cod, n in nodos.items():
        n["holgura"] = max(0, n["LS"] - n["ES"])
        n["es_critica"] = (n["holgura"] == 0 and n["duracion"] > 0)
        for p in n["predecesores"]:
            es_enlace_critico = bool(n["es_critica"] and nodos.get(p, {}).get("es_critica") and nodos[p]["EF"] == n["ES"])
            enlaces_efectivos.append({
                "origen": p,
                "destino": cod,
                "critico": es_enlace_critico
            })

    resultado_completo = dict(nodos)
    for cod, info_orig in actividades_dict.items():
        if info_orig["es_madre"]:
            hojas_hijas = [resultado_completo[h] for h in obtener_hojas_bajo_nodo(cod) if h in resultado_completo]
            if hojas_hijas:
                es_min = min(h["ES"] for h in hojas_hijas)
                ef_max = max(h["EF"] for h in hojas_hijas)
                holgura_min = min(h["holgura"] for h in hojas_hijas)
                es_crit = any(h["es_critica"] for h in hojas_hijas)
                info_madre = dict(info_orig)
                info_madre.update({
                    "ES": es_min,
                    "EF": ef_max,
                    "LS": es_min + holgura_min,
                    "LF": ef_max + holgura_min,
                    "holgura": holgura_min,
                    "es_critica": es_crit
                })
                resultado_completo[cod] = info_madre

    return {
        "duracion_proyecto_dias": duracion_total,
        "modo_duracion": modo_duracion,
        "detalles": resultado_completo,
        "enlaces_efectivos": enlaces_efectivos
    }