import traceback
try:
    from core import app
except Exception:
    from fastapi import FastAPI
    from fastapi.responses import PlainTextResponse
    _tb = traceback.format_exc()
    app = FastAPI()

    @app.get("/{p:path}")
    def _err(p: str):
        return PlainTextResponse(_tb, status_code=200)
