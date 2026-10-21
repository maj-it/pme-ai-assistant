# PME AI Assistant — lancement et déploiement

## En local

```bash
# Backend (terminal 1)
cd backend
cp .env.example .env            # LLM_PROVIDER=auto : Ollama s'il répond, sinon Anthropic (si clé), sinon démo hors ligne
pip install -r requirements.txt --break-system-packages
python3 -m uvicorn main:app --reload --port 8000

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                     # http://localhost:5173 — /api est relayé vers :8000
```

## Production

**Backend (Railway / Render)** : dossier `backend/`, `Procfile` détecté.
Variables : `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (défaut `claude-sonnet-5-5`), `ALLOWED_ORIGINS` (URL du front), `RATE_PER_HOUR` (défaut 40), `DEMO_TOKEN` (facultatif).

**Frontend (Vercel)** : Root Directory `frontend`, preset Vite. Variables : `VITE_API_URL` (URL du backend), `VITE_DEMO_TOKEN` si `DEMO_TOKEN` est défini. Redéployer après tout changement de variable.

## Protéger le crédit API
- `RATE_PER_HOUR` limite les questions par adresse IP.
- `DEMO_TOKEN` + `VITE_DEMO_TOKEN` : barrière légère (le jeton est visible dans le bundle front) ; pour un vrai contrôle, mettre un mot de passe devant le site Vercel.
- Fixer une limite de dépense dans la console Anthropic.

## API
- `GET /health` : mode (`live` ou `offline`)
- `GET /dashboard` : indicateurs, balance âgée, prévision 60 j, pipeline
- `POST /chat/stream` : réponse en flux NDJSON (`tool`, `tool_done`, `text`, `done`, `error`)

## Questions de démo
- « Quelles factures sont en retard ? »
- « Rédige une relance pour Mécanique Centrale SA »
- « Quel est mon solde et que prévois-tu sur 60 jours ? »
- « Quelle opportunité dois-je prioriser ? »
- « Que se passe-t-il si Mécanique Centrale paie avec 30 jours de retard ? »
