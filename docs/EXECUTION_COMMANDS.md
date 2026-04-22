# SniffTest Execution Commands

Run all commands from the project root unless noted.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows:

```bat
.venv\Scripts\activate
```

## Run the Full Project

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

## Backend Checks

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:5000/health
```

## Prediction Examples

Five-class model:

```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"Everyone knows this policy is the only solution left."}'
```

Binary model:

```bash
curl -X POST http://127.0.0.1:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"This viral tea melts ten pounds in a week and doctors hate it."}'
```

CLI:

```bash
python backend/predict_lier_multiclass.py \
  --text "Why criticize this decision when the previous administration caused worse problems?"
```

## Train

```bash
python backend/train_lier_multiclass.py \
  --data-dir data_augmented_v2 \
  --output-dir model_augmented_v2 \
  --class-weights \
  --no-balance
```

With a local base checkpoint:

```bash
python backend/train_lier_multiclass.py \
  --model-path base_model/final \
  --data-dir data_augmented_v2 \
  --output-dir model_augmented_v2 \
  --class-weights \
  --no-balance
```

## Git Commands

```bash
git status
git add .
git commit -m "Initial SniffTest project"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

Model weight files are ignored for regular GitHub compatibility. Use Git LFS or a separate artifact upload if the checkpoint must be submitted.
