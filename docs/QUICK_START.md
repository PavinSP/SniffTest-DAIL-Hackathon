# SniffTest Quick Start

Run these commands from the project root.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows activation:

```bat
.venv\Scripts\activate
```

## Start Services

Terminal 1:

```bash
source .venv/bin/activate
python backend/serve_model_api.py --host 127.0.0.1 --port 8000
```

Terminal 2:

```bash
source .venv/bin/activate
python backend/serve_binary_api.py --host 127.0.0.1 --port 5000
```

Terminal 3:

```bash
python3 -m http.server 4173 --directory frontend
```

Open:

```text
http://127.0.0.1:4173
```

## Test the API

```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"Everyone knows this policy is the only solution left."}'
```

## Notes

The browser game can continue in mock fallback mode if an API is not running. For full AI feedback, run both backend services.
