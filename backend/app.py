from __future__ import annotations

import sys
from pathlib import Path

from flask import Flask, send_from_directory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from api import api  # noqa: E402
from config import flask_config  # noqa: E402

FRONTEND = ROOT / "frontend"


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(FRONTEND), static_url_path="")
    app.register_blueprint(api)

    @app.get("/")
    def index():
        return send_from_directory(FRONTEND, "index.html")

    @app.errorhandler(404)
    def not_found(_e):
        from flask import request

        if request.path.startswith("/api/"):
            return {"error": "Not found"}, 404
        return send_from_directory(FRONTEND, "index.html")

    @app.errorhandler(500)
    def internal_error(_e):
        from flask import request

        if request.path.startswith("/api/"):
            return {"error": "Internal server error"}, 500
        return send_from_directory(FRONTEND, "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    cfg = flask_config()
    app.run(host=cfg["host"], port=cfg["port"], debug=cfg["debug"])
