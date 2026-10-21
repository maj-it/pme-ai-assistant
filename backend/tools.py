"""Outils exposés à Claude + widgets d'affichage renvoyés au front."""
import json
from data import CLIENTS, FACTURES, CASHFLOW
import insights as ins

# nom -> (source affichée, libellé)
META = {
    "get_synthese": ("Agicap · Sage 100 · Pipedrive", "Synthèse de l'activité"),
    "get_factures": ("Sage 100", "Factures"),
    "get_balance_agee": ("Sage 100", "Balance âgée des créances"),
    "get_client": ("Pipedrive + Sage 100", "Fiche client"),
    "get_tresorerie": ("Agicap", "Trésorerie et prévisions"),
    "get_opportunites": ("Pipedrive", "Pipeline commercial"),
    "preparer_relance": ("Sage 100 + Pipedrive", "Analyse de la relance"),
    "creer_brouillon_email": ("Messagerie", "Brouillon d'email"),
}

TOOLS = [
    {"name": "get_synthese", "description": "Indicateurs clés : trésorerie, prévision 30 j, autonomie, impayés, pipeline. À utiliser pour un point global ou un résumé.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_factures", "description": "Liste les factures Sage 100, filtrables par statut et par client. Chaque facture en retard porte un niveau de risque.",
     "input_schema": {"type": "object", "properties": {
         "statut": {"type": "string", "enum": ["en_retard", "à_échoir", "payée", "toutes"], "description": "Défaut : toutes"},
         "client": {"type": "string", "description": "Nom partiel ou ID du client (optionnel)"}}}},
    {"name": "get_balance_agee", "description": "Répartition des créances par ancienneté de retard (à échoir, 1–10 j, 11–30 j, 31–60 j, +60 j).",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_client", "description": "Fiche détaillée d'un client (coordonnées, secteur, CA, factures, opportunités).",
     "input_schema": {"type": "object", "properties": {"nom_ou_id": {"type": "string", "description": "Ex : 'TechCorp', 'C001'"}}, "required": ["nom_ou_id"]}},
    {"name": "get_tresorerie", "description": "Trésorerie Agicap : solde, prévision jour par jour sur 60 jours, point bas, historique mensuel.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_opportunites", "description": "Pipeline commercial Pipedrive : opportunités, étapes, probabilités, valeur pondérée.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "preparer_relance", "description": "Rassemble le contexte d'une relance (facture, client, historique, ton recommandé, mentions légales). À appeler AVANT de rédiger un email de relance.",
     "input_schema": {"type": "object", "properties": {
         "facture_id": {"type": "string", "description": "Ex : F2024-087"},
         "ton": {"type": "string", "enum": ["courtois", "ferme", "urgent"], "description": "Sinon déterminé par les jours de retard"}}, "required": ["facture_id"]}},
    {"name": "creer_brouillon_email", "description": "Affiche à l'utilisateur un brouillon d'email prêt à copier ou à ouvrir dans sa messagerie. À appeler dès que l'email est rédigé ; ne recopie pas l'email dans ta réponse.",
     "input_schema": {"type": "object", "properties": {
         "destinataire_nom": {"type": "string"}, "destinataire_email": {"type": "string"},
         "objet": {"type": "string"}, "corps": {"type": "string", "description": "Texte brut, sauts de ligne autorisés, signature incluse"}},
         "required": ["destinataire_email", "objet", "corps"]}},
]


def _j(o):
    return json.dumps(o, ensure_ascii=False)


def _client(q):
    q = (q or "").lower().strip()
    return next((c for c in CLIENTS if q and (q in c["nom"].lower() or q == c["id"].lower())), None)


def label_for(name, args):
    src, lab = META.get(name, ("", name))
    if name == "get_factures":
        s = args.get("statut", "toutes")
        lab = {"en_retard": "Factures en retard", "à_échoir": "Factures à échoir", "payée": "Factures payées"}.get(s, "Toutes les factures")
        if args.get("client"): lab += f" · {args['client']}"
    elif name == "get_client" and args.get("nom_ou_id"):
        lab = f"Fiche client · {args['nom_ou_id']}"
    elif name == "preparer_relance" and args.get("facture_id"):
        lab = f"Analyse de la relance · {args['facture_id']}"
    return src, lab


def execute(name, args):
    """-> (résultat JSON pour le modèle, widget pour l'interface | None)"""
    if name == "get_synthese":
        k = ins.kpis()
        return _j(k), {"type": "kpis", "data": k}

    if name == "get_factures":
        rows = ins.factures(args.get("statut", "toutes"), args.get("client"))
        data = {"factures": rows, "nombre": len(rows), "total": sum(f["montant"] for f in rows)}
        return _j(data), {"type": "invoices", "data": data}

    if name == "get_balance_agee":
        a = ins.aging()
        return _j({"tranches": a}), {"type": "aging", "data": a}

    if name == "get_client":
        c = _client(args.get("nom_ou_id"))
        if not c:
            return _j({"erreur": f"Aucun client trouvé pour '{args.get('nom_ou_id')}'", "clients_connus": [x["nom"] for x in CLIENTS]}), None
        fs = ins.factures("toutes", c["id"])
        opps = [o for o in ins.pipeline()["opportunites"] if c["nom"].lower() in o["client"].lower()]
        data = {"client": c, "factures": fs, "opportunites": opps,
                "encours_retard": sum(f["montant"] for f in fs if f["statut"] == "en_retard")}
        return _j(data), {"type": "client", "data": data}

    if name == "get_tresorerie":
        fc = ins.forecast()
        data = {"solde_actuel": CASHFLOW["solde_actuel"], "prevision_30j": CASHFLOW["prevision_30j"],
                "encaissements_en_attente": CASHFLOW["encaissements_en_attente"],
                "decaissements_prevus": CASHFLOW["decaissements_prevus"],
                "charges_fixes_mensuelles": CASHFLOW["charges_fixes_mensuelles"],
                "autonomie_mois": ins.kpis()["autonomie_mois"], "seuil_securite": fc["seuil"],
                "point_bas": fc["point_bas"], "passage_sous_seuil": fc["sous_seuil"] or None,
                "historique_mensuel": CASHFLOW["mois"],
                "hypothese": "Prévision hors nouvelles factures ; créances en retard pondérées par leur probabilité d'encaissement."}
        return _j(data), {"type": "cashflow", "data": {**data, "points": fc["points"]}}

    if name == "get_opportunites":
        p = ins.pipeline()
        return _j(p), {"type": "pipeline", "data": p}

    if name == "preparer_relance":
        f = next((x for x in FACTURES if x["id"] == args.get("facture_id")), None)
        if not f:
            return _j({"erreur": f"Facture {args.get('facture_id')} introuvable"}), None
        c = next((x for x in CLIENTS if x["id"] == f["client_id"]), {})
        j = f["jours_retard"]
        ton = args.get("ton") or ("urgent" if j > 30 else "ferme" if j > 10 else "courtois")
        autres = [x["id"] for x in FACTURES if x["client_id"] == f["client_id"] and x["statut"] == "en_retard" and x["id"] != f["id"]]
        payees = [x["id"] for x in FACTURES if x["client_id"] == f["client_id"] and x["statut"] == "payée"]
        data = {"facture": f, "client": c, "ton_recommande": ton, "jours_retard": j,
                "autres_factures_en_retard": autres, "historique_paiement": f"{len(payees)} facture(s) déjà réglée(s)",
                "mentions_legales": "Pénalités de retard dues de plein droit (art. L441-10 C. com.) et indemnité forfaitaire de recouvrement de 40 € (art. D441-5 C. com.). À citer seulement pour un ton ferme ou urgent.",
                "consigne": f"Rédige un email de relance {ton}, adressé à {c.get('contact', 'le client')}, puis appelle creer_brouillon_email."}
        return _j(data), None

    if name == "creer_brouillon_email":
        d = {k: args.get(k, "") for k in ("destinataire_nom", "destinataire_email", "objet", "corps")}
        return _j({"statut": "brouillon affiché à l'utilisateur"}), {"type": "email", "data": d}

    return _j({"erreur": f"Outil inconnu : {name}"}), None
