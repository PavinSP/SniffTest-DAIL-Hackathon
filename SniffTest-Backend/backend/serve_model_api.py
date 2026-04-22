import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from model_runtime import LiarCategoryPredictor


PLAYGROUND_HTML = Path(__file__).with_name("web_playground.html")


class ModelAPIHandler(BaseHTTPRequestHandler):
    server_version = "SniffTestModelAPI/1.0"

    def _write_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _write_html(self, status_code, html_text):
        body = html_text.encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._write_json(200, {"ok": True})

    def do_GET(self):
        if self.path in {"/", "/playground"}:
            self._write_html(200, PLAYGROUND_HTML.read_text(encoding="utf-8"))
            return

        if self.path == "/health":
            self._write_json(
                200,
                {
                    "ok": True,
                    "model_dir": str(self.server.predictor.model_dir),
                    "max_length": self.server.predictor.max_length,
                    "device": str(self.server.predictor.device),
                },
            )
            return

        self._write_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/predict":
            self._write_json(404, {"error": "Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(content_length)
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception as exc:
            self._write_json(400, {"error": f"Invalid JSON: {exc}"})
            return

        texts = []
        if isinstance(payload.get("text"), str) and payload["text"].strip():
            texts = [payload["text"].strip()]
        elif isinstance(payload.get("texts"), list):
            texts = [item.strip() for item in payload["texts"] if isinstance(item, str) and item.strip()]

        if not texts:
            self._write_json(400, {"error": "Send either 'text': string or 'texts': [string, ...]"})
            return

        try:
            predictions = self.server.predictor.predict(texts)
        except Exception as exc:
            self._write_json(500, {"error": f"Prediction failed: {exc}"})
            return

        self._write_json(
            200,
            {
                "count": len(predictions),
                "predictions": predictions,
            },
        )


def parse_args():
    parser = argparse.ArgumentParser(description="Serve the SniffTest five-class classifier as a local REST API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--model-dir", default="model_augmented_v2/final")
    parser.add_argument("--max-length", type=int, default=256)
    return parser.parse_args()


def main():
    args = parse_args()
    model_dir = Path(args.model_dir)
    if not model_dir.is_absolute():
        model_dir = Path(__file__).resolve().parent / model_dir

    predictor = LiarCategoryPredictor(model_dir=model_dir, max_length=args.max_length)
    server = ThreadingHTTPServer((args.host, args.port), ModelAPIHandler)
    server.predictor = predictor
    print(f"Listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
