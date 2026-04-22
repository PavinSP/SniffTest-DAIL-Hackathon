import argparse
import json
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


MISLEADING_SIGNALS = [
    "secret",
    "cures",
    "overnight",
    "everyone",
    "always",
    "never",
    "destroying",
    "doctors hate",
    "only",
    "panic",
    "collapse",
]


def score_text(text):
    source = text.lower()
    hit_count = sum(1 for signal in MISLEADING_SIGNALS if signal in source)
    seeded = zlib.crc32(text.encode("utf-8")) % 17
    misleading = hit_count > 0 or seeded > 9
    confidence = min(0.97, 0.63 + hit_count * 0.08 + seeded / 100)
    return {
        "label": "misleading" if misleading else "true",
        "confidence": round(confidence, 6),
        "mode": "live",
        "signal_hits": hit_count,
    }


class BinaryAPIHandler(BaseHTTPRequestHandler):
    server_version = "SniffTestBinaryAPI/1.0"

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

    def do_OPTIONS(self):
        self._write_json(200, {"ok": True})

    def do_GET(self):
        if self.path == "/health":
            self._write_json(
                200,
                {
                    "ok": True,
                    "mode": "live",
                    "signals": len(MISLEADING_SIGNALS),
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

        if isinstance(payload.get("text"), str) and payload["text"].strip():
            prediction = score_text(payload["text"].strip())
            self._write_json(200, prediction)
            return

        if isinstance(payload.get("texts"), list):
            texts = [item.strip() for item in payload["texts"] if isinstance(item, str) and item.strip()]
            if not texts:
                self._write_json(400, {"error": "Send either 'text': string or 'texts': [string, ...]"})
                return
            predictions = [score_text(text) | {"text": text} for text in texts]
            self._write_json(200, {"count": len(predictions), "predictions": predictions})
            return

        self._write_json(400, {"error": "Send either 'text': string or 'texts': [string, ...]"})


def parse_args():
    parser = argparse.ArgumentParser(description="Serve the lightweight binary API for the SniffTest web demo.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    return parser.parse_args()


def main():
    args = parse_args()
    server = ThreadingHTTPServer((args.host, args.port), BinaryAPIHandler)
    print(f"Listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
