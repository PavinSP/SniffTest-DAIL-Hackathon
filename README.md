# SniffTest

SniffTest is a browser-based media-literacy game that trains users to recognize misleading claims and rhetorical manipulation. This repository contains the web-based version and backend infrastructure for our hackathon submission. **Note:** This website is a companion to the primary mobile iOS app being developed by my teammate. My role in this project is focused on the web frontend and the backend APIs that power the lie-detection AI.

The project combines a six-level JavaScript game with local Python APIs for binary true/misleading feedback and five-class manipulation-tactic classification.

## Problem

Misleading claims are often persuasive because they use recognizable language patterns: emotional framing, false choices, selective evidence, fake consensus, or deflection. SniffTest turns those patterns into a playable training flow so users practice identifying the tactic, receive AI feedback, and track their progress over time.

## What the Game Teaches

The multiclass model predicts one of five manipulation categories:

- `loaded language`
- `false dichotomy`
- `manufactured consensus`
- `cherry-picking`
- `whataboutism`

The game starts with simpler binary decisions and moves toward tactic identification, explanation, timed judgment, human-versus-AI comparison, and adversarial statement writing.

## Project Structure

```text
.
├── README.md
├── requirements.txt
├── backend/
│   ├── serve_model_api.py
│   ├── serve_binary_api.py
│   ├── model_runtime.py
│   ├── predict_lier_multiclass.py
│   ├── train_lier_multiclass.py
│   ├── augment_weak_categories.py
│   ├── data/
│   ├── data_augmented_v2/
│   └── model_augmented_v2/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── config.local.example.js
│   └── js/
├── data/
│   └── liar_dataset/
└── docs/
    ├── Problem.md
    ├── IMPLEMENTATION_GUIDE.md
    ├── EXECUTION_COMMANDS.md
    └── QUICK_START.md
```

The old unused implementation was removed from the working project: `Codes/`, `Codes.zip`, `fake_news_model/`, duplicate root JSON data files, root experimental scripts, and intermediate model checkpoints/model runs.

## How It Works

1. The player opens the frontend and chooses a level.
2. The frontend selects a statement from `frontend/js/content.js`.
3. For binary levels, the browser calls `POST /predict` on the binary API at port `5000`.
4. For tactic-identification levels, the browser calls `POST /predict` on the multiclass API at port `8000`.
5. The backend returns the predicted label, confidence score, and class probabilities.
6. The frontend compares the player answer with the expected answer and shows feedback.
7. Progress, unlocked levels, attempts, accuracy, and streaks are stored locally in browser `localStorage`.

If an API is not running, the frontend can use mock fallback predictions so the game flow remains playable during demos.

## Model Pipeline

The final model is a DistilBERT sequence classifier fine-tuned for five manipulation categories.

Pipeline:

1. Start from LIAR dataset statements in `data/liar_dataset/`.
2. Convert/categorize statements into the five SniffTest manipulation classes.
3. Split data into train, validation, and test files.
4. Augment weak categories in the training split only.
5. Fine-tune DistilBERT with class weighting.
6. Save metrics, test predictions, tokenizer files, and the final checkpoint under `backend/model_augmented_v2/`.

## Results

Final augmented model metrics:

```text
validation accuracy: 0.6615
validation macro F1: 0.4689
test accuracy:       0.6533
test macro F1:       0.5838
test weighted F1:    0.6414
```

Per-class test F1:

```text
loaded language:          0.6774
false dichotomy:          0.2500
manufactured consensus:   0.5000
cherry-picking:           0.6222
whataboutism:             0.8696
```

The result is a working educational prototype: users can play through a full six-level training experience while the model provides category-level feedback and confidence scores.

## Setup

Use Python 3.9 or 3.10 for the pinned ML dependencies.

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

On Windows, activate with:

```bat
.venv\Scripts\activate
```

## Run the Project

Use three terminals from the project root.

Terminal 1: start the five-class model API:

```bash
source .venv/bin/activate
python backend/serve_model_api.py --host 127.0.0.1 --port 8000
```

Terminal 2: start the binary API:

```bash
source .venv/bin/activate
python backend/serve_binary_api.py --host 127.0.0.1 --port 5000
```

Terminal 3: serve the frontend:

```bash
python3 -m http.server 4173 --directory frontend
```

Open the game:

```text
http://127.0.0.1:4173
```

## API Examples

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Five-class prediction:

```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"Everyone knows this policy is the only solution left."}'
```

Binary prediction:

```bash
curl -X POST http://127.0.0.1:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"Doctors confirm this kitchen spice cures memory loss overnight."}'
```

CLI prediction:

```bash
python backend/predict_lier_multiclass.py \
  --text "Why criticize this decision when the previous administration caused worse problems?"
```

## Train or Rebuild the Model

The final local model can be rebuilt with:

```bash
python backend/train_lier_multiclass.py \
  --data-dir data_augmented_v2 \
  --output-dir model_augmented_v2 \
  --class-weights \
  --no-balance
```

By default, the script fine-tunes `distilbert-base-uncased`. If you have a local base checkpoint, pass it explicitly:

```bash
python backend/train_lier_multiclass.py \
  --model-path base_model/final \
  --data-dir data_augmented_v2 \
  --output-dir model_augmented_v2 \
  --class-weights \
  --no-balance
```

## GitHub Submission Notes

Regular GitHub rejects files larger than 100 MB. The local model weights are ignored by `.gitignore`:

- `*.safetensors`
- `*.pt`
- `*.pth`
- `training_args.bin`
- `backend/base_model/`
- checkpoint folders

This keeps the repository suitable for a normal GitHub push. The code, data splits, tokenizer metadata, predictions, and metrics remain organized in the repository. You can use Git LFS if you want to store the model artifacts remotely.

## Documentation

- `backend/README.md` - backend API and model notes
- `frontend/README.md` - website/game notes
- `docs/IMPLEMENTATION_GUIDE.md` - deeper implementation details
- `docs/EXECUTION_COMMANDS.md` - extended command reference
- `docs/Problem.md` - original problem statement
