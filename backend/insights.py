"""Calculs métier sur les données simulées : KPIs, balance âgée, prévision de trésorerie, pipeline."""
from datetime import date, timedelta
from data import CLIENTS, FACTURES, CASHFLOW, OPPORTUNITIES

TODAY = date.today()
SEUIL_SECURITE = CASHFLOW["charges_fixes_mensuelles"]  # 1 mois de charges fixes

# Probabilité d'encaissement et délai estimé des factures déjà en retard
def _p_retard(j):
    return 0.9 if j <= 10 else 0.75 if j <= 30 else 0.5

def _delai_retard(j):
    return 7 if j <= 10 else 21 if j <= 30 else 40


def risk_level(jours):
    return "élevé" if jours > 30 else "moyen" if jours > 10 else "faible"


def factures(statut="toutes", client=None):
    out = [f for f in FACTURES if statut in ("toutes", None) or f["statut"] == statut]
    if client:
        q = client.lower()
        out = [f for f in out if q in f["client"].lower() or q == f["client_id"].lower()]
    out = [{**f, "risque": risk_level(f["jours_retard"]) if f["statut"] == "en_retard" else None} for f in out]
    return sorted(out, key=lambda f: (-f["jours_retard"], f["echeance"]))


def aging():
    b = {"a_echoir": 0.0, "j1_10": 0.0, "j11_30": 0.0, "j31_60": 0.0, "j60p": 0.0}
    n = {k: 0 for k in b}
    for f in FACTURES:
        if f["statut"] == "payée":
            continue
        j = f["jours_retard"]
        k = "a_echoir" if f["statut"] == "à_échoir" else "j1_10" if j <= 10 else "j11_30" if j <= 30 else "j31_60" if j <= 60 else "j60p"
        b[k] += f["montant"]; n[k] += 1
    labels = {"a_echoir": "À échoir", "j1_10": "1–10 j", "j11_30": "11–30 j", "j31_60": "31–60 j", "j60p": "+60 j"}
    return [{"key": k, "label": labels[k], "montant": b[k], "nombre": n[k]} for k in b]


def forecast(days=60):
    """Solde projeté jour par jour. Calé sur la prévision à 30 j d'Agicap pour rester cohérent avec les KPIs."""
    flux = {}
    def add(d, v): flux[d] = flux.get(d, 0) + v
    for f in FACTURES:
        if f["statut"] == "à_échoir":
            add((date.fromisoformat(f["echeance"]) - TODAY).days, f["montant"] + f["tva"])
        elif f["statut"] == "en_retard":
            add(_delai_retard(f["jours_retard"]), (f["montant"] + f["tva"]) * _p_retard(f["jours_retard"]))
    dec = CASHFLOW["decaissements_prevus"]
    for d, share in ((6, .3), (14, .3), (22, .4)):
        add(d, -dec * share)
    burn = CASHFLOW["charges_fixes_mensuelles"] / 30
    bal, raw = CASHFLOW["solde_actuel"], []
    for d in range(days + 1):
        if d: bal += flux.get(d, 0) - burn
        raw.append(bal)
    adj30 = CASHFLOW["prevision_30j"] - raw[30]
    pts = []
    for d in range(days + 1):
        v = raw[d] + adj30 * min(d, 30) / 30
        pts.append({"jour": d, "date": (TODAY + timedelta(days=d)).isoformat(), "solde": round(v)})
    low = min(pts, key=lambda p: p["solde"])
    return {"points": pts, "seuil": SEUIL_SECURITE, "point_bas": low,
            "sous_seuil": [p["date"] for p in pts if p["solde"] < SEUIL_SECURITE][:1]}


def pipeline():
    ordre = ["Découverte", "Proposition envoyée", "Négociation"]
    rows = sorted(OPPORTUNITIES, key=lambda o: -o["valeur"] * o["probabilite"])
    stages = []
    for e in ordre:
        os_ = [o for o in OPPORTUNITIES if o["etape"] == e]
        stages.append({"etape": e, "nombre": len(os_), "valeur": sum(o["valeur"] for o in os_),
                       "pondere": round(sum(o["valeur"] * o["probabilite"] / 100 for o in os_))})
    return {"opportunites": rows, "etapes": stages,
            "brut": sum(o["valeur"] for o in OPPORTUNITIES),
            "pondere": round(sum(o["valeur"] * o["probabilite"] / 100 for o in OPPORTUNITIES))}


def kpis():
    retard = [f for f in FACTURES if f["statut"] == "en_retard"]
    echoir = [f for f in FACTURES if f["statut"] == "à_échoir"]
    impaye = sum(f["montant"] for f in retard)
    encours = impaye + sum(f["montant"] for f in echoir)
    fc, pl = forecast(), pipeline()
    return {
        "date": TODAY.isoformat(),
        "solde": CASHFLOW["solde_actuel"],
        "prevision_30j": CASHFLOW["prevision_30j"],
        "autonomie_mois": round(CASHFLOW["solde_actuel"] / CASHFLOW["charges_fixes_mensuelles"], 1),
        "point_bas": fc["point_bas"],
        "factures_en_retard": len(retard),
        "total_impaye": impaye,
        "retard_moyen_jours": round(sum(f["jours_retard"] for f in retard) / len(retard)) if retard else 0,
        "part_impaye_pct": round(100 * impaye / encours) if encours else 0,
        "a_echoir": sum(f["montant"] for f in echoir),
        "pipeline_brut": pl["brut"],
        "pipeline_pondere": pl["pondere"],
        "opportunites": len(OPPORTUNITIES),
        "mois": CASHFLOW["mois"],
    }


def dashboard():
    return {"kpis": kpis(), "aging": aging(), "forecast": forecast(), "pipeline": pipeline(),
            "retards": factures("en_retard")}
