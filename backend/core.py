"""PME AI Assistant — API FastAPI (démo BLC Conseil)."""
import json, os, time
from collections import defaultdict, deque
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import engine
import insights as ins

DEMO_TOKEN = os.getenv("DEMO_TOKEN", "").strip()          # facultatif : protège l'usage du crédit API
RATE_PER_HOUR = int(os.getenv("RATE_PER_HOUR", "40"))
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(title="PME AI Assistant API", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

_hits = defaultdict(deque)


def guard(request: Request, token: str | None):
    if DEMO_TOKEN and token != DEMO_TOKEN:
        raise HTTPException(401, "Jeton d'accès invalide.")
    ip = (request.headers.get("x-forwarded-for") or request.client.host or "?").split(",")[0].strip()
    q, now = _hits[ip], time.time()
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= RATE_PER_HOUR:
        raise HTTPException(429, f"Limite de {RATE_PER_HOUR} questions par heure atteinte pour la démo.")
    q.append(now)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1500)
    history: list = Field(default_factory=list, max_length=120)


@app.get("/health")
def health():
    return {"ok": True, **engine.status(), "protected": bool(DEMO_TOKEN)}


@app.get("/dashboard")
def dashboard():
    return ins.dashboard()


@app.get("/stats")  # compatibilité avec l'ancienne version du front
def stats():
    k = ins.kpis()
    return {"factures_en_retard": k["factures_en_retard"], "total_impaye": k["total_impaye"],
            "solde_tresorerie": k["solde"], "opportunites": k["opportunites"]}


@app.post("/chat/stream")
def chat_stream(req: ChatRequest, request: Request, x_demo_token: str | None = Header(default=None)):
    guard(request, x_demo_token)

    def gen():
        try:
            for ev in engine.chat(req.message, req.history):
                yield json.dumps(ev, ensure_ascii=False) + "\n"
        except Exception as e:  # ne jamais laisser le flux se couper sans message
            yield json.dumps({"t": "error", "message": f"Erreur serveur : {type(e).__name__}"}) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
