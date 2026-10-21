"""Moteur de conversation : Claude en streaming avec outils, ou mode démo hors ligne sans clé API."""
import json, os, re, time, urllib.error, urllib.request, uuid, unicodedata
from datetime import date
from data import CLIENTS, FACTURES
import insights as ins
import tools as T

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
MAX_TURNS = 8      # tours de conversation conservés
MAX_STEPS = 6      # appels d'outils enchaînés max par question
API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
PREF = os.getenv("LLM_PROVIDER", "auto").strip().lower()      # auto | ollama | anthropic | offline
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "").strip()          # vide = détection automatique (qwen en priorité)
if os.getenv("FORCE_OFFLINE") == "1":
    PREF = "offline"

_ol = {"t": 0.0, "ok": False, "models": []}


def ollama_status():
    """Ollama joignable ? (cache 5 s pour ne pas bloquer /health)"""
    if time.time() - _ol["t"] < 5:
        return _ol
    try:
        with urllib.request.urlopen(OLLAMA_URL + "/api/tags", timeout=1.5) as r:
            models = [m["name"] for m in json.load(r).get("models", [])]
    except Exception:
        models = []
    _ol.update(t=time.time(), ok=bool(models), models=models)
    return _ol


def ollama_model():
    if OLLAMA_MODEL:
        return OLLAMA_MODEL
    cands = [m for m in ollama_status()["models"] if "embed" not in m.lower()]
    cands.sort(key=lambda m: "qwen" not in m.lower())
    return cands[0] if cands else None


def provider():
    if PREF == "ollama":
        return "ollama"
    if PREF == "anthropic":
        return "anthropic" if API_KEY else "offline"
    if PREF == "offline":
        return "offline"
    if ollama_status()["ok"]:
        return "ollama"
    return "anthropic" if API_KEY else "offline"


def status():
    p = provider()
    if p == "ollama":
        return {"mode": "ollama", "model": ollama_model(), "ready": ollama_status()["ok"]}
    if p == "anthropic":
        return {"mode": "anthropic", "model": MODEL, "ready": True}
    return {"mode": "offline", "model": None, "ready": True}

_client = None
def client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic(api_key=API_KEY, timeout=60.0, max_retries=2)
    return _client


def system_prompt():
    return f"""Tu es l'assistant IA de BLC Conseil, intégrateur de solutions pour PME. Tu aides le dirigeant ou le DAF d'une PME cliente à piloter son activité à partir de ses données Sage 100 (factures), Pipedrive (clients, CRM) et Agicap (trésorerie).
Date du jour : {date.today().strftime('%d/%m/%Y')}.

Méthode
- Pour toute question sur l'entreprise, interroge d'abord les outils ; n'invente aucun chiffre. Plusieurs outils si besoin.
- L'interface affiche déjà tableaux et graphiques issus des outils : ne les recopie pas. Donne l'essentiel : le chiffre clé, ce qui compte, le risque, puis une recommandation actionnable.
- Style : français, direct, professionnel, 120 mots maximum sauf demande de détail. Montants au format 4 500 €. Gras pour les chiffres décisifs, listes courtes.
- Relance : appelle preparer_relance, rédige l'email (vouvoiement, objet clair, facture et échéance citées, action demandée avec date), puis appelle creer_brouillon_email. Ne recopie pas l'email dans ta réponse : commente en une ou deux phrases le ton choisi.
- Termine, quand c'est pertinent, par une proposition de suite en une phrase (ex. « Souhaitez-vous que je relance aussi Bâti Pro ? »).
- Si une donnée manque ou si la demande sort du périmètre, dis-le simplement."""


def _slug(s):
    return unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode()


def trim_history(history):
    """Garde les MAX_TURNS derniers tours, sans couper une paire tool_use / tool_result."""
    starts = [i for i, m in enumerate(history) if m.get("role") == "user" and isinstance(m.get("content"), str)]
    return history[starts[-MAX_TURNS]:] if len(starts) > MAX_TURNS else history


def _run_tool(block_id, name, args):
    src, label = T.label_for(name, args)
    result, widget = T.execute(name, args)
    return result, {"t": "tool_done", "id": block_id, "widget": widget}


# ───────────────────────── Claude (streaming) ─────────────────────────
def chat_live(message, history):
    import anthropic
    messages = trim_history(history) + [{"role": "user", "content": message}]
    for _ in range(MAX_STEPS):
        try:
            with client().messages.stream(model=MODEL, max_tokens=1500, system=system_prompt(), tools=T.TOOLS, messages=messages) as stream:
                for ev in stream:
                    if ev.type == "content_block_start" and ev.content_block.type == "tool_use":
                        yield {"t": "tool", "id": ev.content_block.id, "name": ev.content_block.name,
                               "source": T.META.get(ev.content_block.name, ("", ""))[0],
                               "label": T.META.get(ev.content_block.name, ("", ev.content_block.name))[1]}
                    elif ev.type == "content_block_delta" and ev.delta.type == "text_delta":
                        yield {"t": "text", "d": ev.delta.text}
                final = stream.get_final_message()
        except anthropic.APIStatusError as e:
            detail = getattr(e, "message", str(e))
            hint = " Vérifiez la clé API (workspace Default) et le crédit du compte." if e.status_code in (400, 401, 403) else ""
            yield {"t": "error", "message": f"Anthropic a répondu {e.status_code} : {detail}.{hint}"}
            return
        except anthropic.APIConnectionError:
            yield {"t": "error", "message": "Connexion à l'API Anthropic impossible. Réessayez dans un instant."}
            return

        content = [b.model_dump(exclude_none=True) for b in final.content]
        messages.append({"role": "assistant", "content": content})
        if final.stop_reason != "tool_use":
            yield {"t": "done", "history": messages}
            return
        results = []
        for b in final.content:
            if b.type == "tool_use":
                res, ev = _run_tool(b.id, b.name, b.input or {})
                # on renvoie l'étiquette précise (statut, client…) maintenant que les arguments sont connus
                _, label = T.label_for(b.name, b.input or {})
                ev["label"] = label
                yield ev
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": res})
        messages.append({"role": "user", "content": results})
    yield {"t": "error", "message": "La demande a nécessité trop d'étapes. Reformulez-la plus simplement."}


# ───────────────────────── Ollama (local) ─────────────────────────
class ThinkFilter:
    """Retire les blocs <think>…</think> émis par certains modèles (qwen3, deepseek-r1) dans le flux."""
    def __init__(self):
        self.buf, self.inside = "", False

    def feed(self, s):
        self.buf += s
        out = ""
        while True:
            if self.inside:
                i = self.buf.find("</think>")
                if i < 0:
                    self.buf = self.buf[-7:]
                    return out
                self.buf, self.inside = self.buf[i + 8:], False
            else:
                i = self.buf.find("<think>")
                if i >= 0:
                    out += self.buf[:i]
                    self.buf, self.inside = self.buf[i + 7:], True
                    continue
                k = max((n for n in range(1, min(7, len(self.buf)) + 1) if "<think>".startswith(self.buf[-n:])), default=0)
                out += self.buf[:len(self.buf) - k]
                self.buf = self.buf[len(self.buf) - k:]
                return out

    def flush(self):
        out = "" if self.inside else self.buf
        self.buf = ""
        return out


def to_ollama(neutral):
    """Historique au format Anthropic (blocs) -> messages Ollama."""
    names, out = {}, []
    for m in neutral:
        c = m["content"]
        if isinstance(c, str):
            out.append({"role": m["role"], "content": c})
        elif m["role"] == "assistant":
            calls = []
            for b in c:
                if b.get("type") == "tool_use":
                    names[b["id"]] = b["name"]
                    calls.append({"function": {"name": b["name"], "arguments": b.get("input", {})}})
            msg = {"role": "assistant", "content": "".join(b.get("text", "") for b in c if b.get("type") == "text")}
            if calls:
                msg["tool_calls"] = calls
            out.append(msg)
        else:
            for b in c:
                if b.get("type") == "tool_result":
                    out.append({"role": "tool", "tool_name": names.get(b.get("tool_use_id"), ""), "content": b.get("content", "")})
                elif b.get("type") == "text":
                    out.append({"role": "user", "content": b["text"]})
    return out


def chat_ollama(message, history):
    model = ollama_model()
    if not ollama_status()["ok"] or not model:
        yield {"t": "error", "message": f"Ollama est injoignable sur {OLLAMA_URL} (ou aucun modèle installé). Démarrez-le, puis par exemple : ollama pull qwen2.5:7b"}
        return
    tools = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}} for t in T.TOOLS]
    sys_msg = system_prompt() + "\n- Appelle toujours l'outil adapté avant de répondre : ne réponds jamais de mémoire sur les chiffres de l'entreprise."
    neutral = trim_history(history) + [{"role": "user", "content": message}]
    for _ in range(MAX_STEPS):
        body = {"model": model, "messages": [{"role": "system", "content": sys_msg}] + to_ollama(neutral), "tools": tools,
                "stream": True, "options": {"temperature": 0.2, "num_ctx": 8192}}
        text, calls, flt = "", [], ThinkFilter()
        try:
            req = urllib.request.Request(OLLAMA_URL + "/api/chat", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                for line in r:
                    if not line.strip():
                        continue
                    d = json.loads(line)
                    if d.get("error"):
                        yield {"t": "error", "message": f"Ollama : {d['error']}"}
                        return
                    m = d.get("message") or {}
                    for tc in m.get("tool_calls") or []:
                        fn = tc.get("function", {})
                        args = fn.get("arguments") or {}
                        if isinstance(args, str):
                            try: args = json.loads(args)
                            except Exception: args = {}
                        tid = "ol_" + uuid.uuid4().hex[:10]
                        calls.append((tid, fn.get("name", ""), args))
                        yield {"t": "tool", "id": tid, "name": fn.get("name", ""), "source": T.META.get(fn.get("name", ""), ("", ""))[0],
                               "label": T.META.get(fn.get("name", ""), ("", fn.get("name", "")))[1]}
                    out = flt.feed(m.get("content", "")) if m.get("content") else ""
                    if out:
                        text += out
                        yield {"t": "text", "d": out}
            tail = flt.flush()
            if tail:
                text += tail
                yield {"t": "text", "d": tail}
        except urllib.error.HTTPError as e:
            detail = ""
            try: detail = json.loads(e.read().decode()).get("error", "")
            except Exception: pass
            hint = " Ce modèle ne gère pas les outils : utilisez qwen2.5 ou qwen3 (OLLAMA_MODEL)." if "tools" in detail.lower() else ""
            yield {"t": "error", "message": f"Ollama a répondu {e.code} : {detail}.{hint}"}
            return
        except Exception as e:
            yield {"t": "error", "message": f"Connexion à Ollama impossible ({type(e).__name__}). Vérifiez {OLLAMA_URL}."}
            return

        blocks = ([{"type": "text", "text": text}] if text.strip() else []) + [{"type": "tool_use", "id": i, "name": n, "input": a} for i, n, a in calls]
        neutral.append({"role": "assistant", "content": blocks or [{"type": "text", "text": ""}]})
        if not calls:
            yield {"t": "done", "history": neutral}
            return
        results = []
        for tid, name, args in calls:
            res, ev = _run_tool(tid, name, args)
            ev["label"] = T.label_for(name, args)[1]
            yield ev
            results.append({"type": "tool_result", "tool_use_id": tid, "content": res})
        neutral.append({"role": "user", "content": results})
    yield {"t": "error", "message": "La demande a nécessité trop d'étapes. Reformulez-la plus simplement."}


# ───────────────────────── Mode démo hors ligne ─────────────────────────
def _eur(n):
    return f"{int(n + 0.5):,}".replace(",", " ") + " €"


def _find_client(msg):
    m = _slug(msg)
    for c in CLIENTS:
        stem = _slug(c["nom"]).split()[0]
        if stem in m or _slug(c["nom"]) in m:
            return c
    return None


def _call(name, args, steps):
    tid = "off_" + uuid.uuid4().hex[:8]
    src, label = T.label_for(name, args)
    steps.append({"t": "tool", "id": tid, "name": name, "source": src, "label": label})
    time.sleep(0.35)
    res, ev = _run_tool(tid, name, args)
    ev["label"] = label
    steps.append(ev)
    return res


def _stream_text(text):
    for w in re.findall(r"\S+\s*", text):
        yield {"t": "text", "d": w}
        time.sleep(0.012)


def _relance_email(f, c, ton):
    j = f["jours_retard"]
    nom = c.get("contact", "")
    prenom_nom = nom.split(" ", 1)[-1] if nom else ""
    ouverture = {"courtois": "Sauf erreur de notre part, la facture ci-dessous n'a pas encore été réglée.",
                 "ferme": "Malgré notre précédent échange, la facture ci-dessous reste impayée à ce jour.",
                 "urgent": "La facture ci-dessous demeure impayée malgré nos relances, avec un retard de plus de 30 jours."}[ton]
    legal = "\n\nConformément à l'article L441-10 du Code de commerce, des pénalités de retard sont exigibles, ainsi qu'une indemnité forfaitaire de recouvrement de 40 €." if ton != "courtois" else ""
    limite = {"courtois": "sous 7 jours", "ferme": "sous 5 jours ouvrés", "urgent": "sous 48 h"}[ton]
    corps = (f"Bonjour {nom},\n\n{ouverture}\n\n"
             f"• Facture {f['id']} — {f['description']}\n• Montant : {_eur(f['montant'] + f['tva'])} TTC\n"
             f"• Échéance : {date.fromisoformat(f['echeance']).strftime('%d/%m/%Y')} ({j} jours de retard)\n\n"
             f"Nous vous remercions de bien vouloir procéder au règlement {limite}. Si le paiement a déjà été effectué, merci de ne pas tenir compte de ce message et de nous transmettre la référence du virement."
             f"{legal}\n\nBien cordialement,\nBLC Conseil — Service comptabilité clients")
    return {"destinataire_nom": nom, "destinataire_email": c.get("email", ""),
            "objet": f"Facture {f['id']} — règlement en attente" if ton == "courtois" else f"{'URGENT — ' if ton == 'urgent' else ''}Relance facture {f['id']} ({_eur(f['montant'] + f['tva'])})",
            "corps": corps}


def chat_offline(message, history):
    m = _slug(message)
    steps, text = [], ""
    c = _find_client(message)
    retards = ins.factures("en_retard")

    if "relanc" in m or "redige" in m or "ecris" in m:
        cand = [f for f in retards if not c or f["client_id"] == c["id"]]
        if not cand:
            text = "Aucune facture en retard à relancer" + (f" pour **{c['nom']}**." if c else ".")
        else:
            f = cand[0]
            cl = next(x for x in CLIENTS if x["id"] == f["client_id"])
            _call("preparer_relance", {"facture_id": f["id"]}, steps)
            ton = "urgent" if f["jours_retard"] > 30 else "ferme" if f["jours_retard"] > 10 else "courtois"
            tid = "off_" + uuid.uuid4().hex[:8]
            src, label = T.label_for("creer_brouillon_email", {})
            steps.append({"t": "tool", "id": tid, "name": "creer_brouillon_email", "source": src, "label": label})
            time.sleep(0.3)
            _, w = T.execute("creer_brouillon_email", _relance_email(f, cl, ton))
            steps.append({"t": "tool_done", "id": tid, "label": label, "widget": w})
            text = (f"J'ai préparé une relance **{ {'courtois':'courtoise','ferme':'ferme','urgent':'urgente'}[ton] }** pour **{cl['nom']}** : facture {f['id']}, **{_eur(f['montant'])}** HT, "
                    f"**{f['jours_retard']} jours** de retard. " +
                    ("Le ton est soutenu car le retard dépasse 30 jours, avec rappel des pénalités légales. " if ton == "urgent" else "") +
                    "Relisez-le puis ouvrez-le dans votre messagerie.")
    elif c and not any(k in m for k in ("tresor", "pipeline")):
        _call("get_client", {"nom_ou_id": c["nom"]}, steps)
        fs = ins.factures("en_retard", c["id"])
        text = (f"**{c['nom']}** ({c['secteur']}, {c['ville']}) pèse {_eur(c['ca_annuel'])} de CA annuel. " +
                (f"Attention : **{_eur(sum(f['montant'] for f in fs))}** de factures en retard, jusqu'à **{max(f['jours_retard'] for f in fs)} jours**. Souhaitez-vous une relance ?" if fs else "Aucun impayé : compte à jour."))
    elif any(k in m for k in ("tresor", "solde", "cash", "liquidit")):
        _call("get_tresorerie", {}, steps)
        k = ins.kpis()
        text = (f"Solde actuel **{_eur(k['solde'])}**, soit **{str(k['autonomie_mois']).replace('.', ',')} mois** de charges fixes. Prévision à 30 jours : **{_eur(k['prevision_30j'])}**. "
                f"Le point bas projeté ({_eur(k['point_bas']['solde'])}, le {date.fromisoformat(k['point_bas']['date']).strftime('%d/%m')}) reste au-dessus du seuil de sécurité : pas de tension à court terme, "
                "à condition que les impayés soient recouvrés.")
    elif any(k in m for k in ("pipeline", "opportun", "commercial", "crm", "prospect")):
        _call("get_opportunites", {}, steps)
        p = ins.pipeline()
        text = (f"Pipeline brut **{_eur(p['brut'])}**, pondéré **{_eur(p['pondere'])}**. La priorité : **Transport Express 44** (85 %, en négociation) "
                "pour sécuriser vite, et **Santé Plus Clinique**, la plus grosse valeur (18 000 €, 70 %).")
    elif any(k in m for k in ("balance", "anciennete", "agee", "aging")):
        _call("get_balance_agee", {}, steps)
        text = "Plus de la moitié des impayés se concentre sur la tranche **31–60 jours** (Mécanique Centrale). C'est elle qu'il faut traiter en premier."
    elif any(k in m for k in ("retard", "impay", "facture")):
        _call("get_factures", {"statut": "en_retard"}, steps)
        tot = sum(f["montant"] for f in retards)
        text = (f"**{len(retards)} factures** en retard pour **{_eur(tot)}** HT. La plus critique : **Mécanique Centrale SA**, "
                f"{_eur(retards[0]['montant'])} à **{retards[0]['jours_retard']} jours**. Souhaitez-vous que je prépare les relances ?")
    else:
        _call("get_synthese", {}, steps)
        k = ins.kpis()
        text = (f"Point rapide : trésorerie **{_eur(k['solde'])}**, **{k['factures_en_retard']} factures** en retard ({_eur(k['total_impaye'])}), "
                f"pipeline pondéré **{_eur(k['pipeline_pondere'])}**. Le sujet n°1 reste le recouvrement.")

    for s in steps:
        yield s
    yield from _stream_text(text)
    yield {"t": "done", "history": (history or []) + [{"role": "user", "content": message}, {"role": "assistant", "content": [{"type": "text", "text": text}]}]}


def chat(message, history):
    return {"ollama": chat_ollama, "anthropic": chat_live}.get(provider(), chat_offline)(message, history)
