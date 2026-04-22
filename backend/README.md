# SniffTest Backend

Backend code for SniffTest's AI feedback layer.

## Components

- `serve_model_api.py` - REST API for the five-class manipulation classifier
- `serve_binary_api.py` - lightweight binary true/misleading API for early levels
- `model_runtime.py` - local DistilBERT inference wrapper
- `predict_lier_multiclass.py` - command-line prediction utility
- `train_lier_multiclass.py` - DistilBERT fine-tuning script
- `augment_weak_categories.py` - synthetic augmentation for underrepresented categories
- `split_train_dataset.py` - train/validation/test split utility
- `data/` - categorized base data
- `data_augmented_v2/` - final augmented training split
- `model_augmented_v2/metrics/` - final evaluation metrics
- `model_augmented_v2/final/` - local final model folder

## APIs

Start the five-class classifier:

```bash
python backend/serve_model_api.py --host 127.0.0.1 --port 8000
```

Start the binary classifier:

```bash
python backend/serve_binary_api.py --host 127.0.0.1 --port 5000
```

Both APIs support:

- `GET /health`
- `POST /predict`

Example:

```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"Everyone knows this policy is the only solution left."}'
```

## Model Results

Final augmented five-class model:

```text
validation accuracy: 0.6615
validation macro F1: 0.4643
test accuracy:       0.6533
test macro F1:       0.5741
```

The five classes are loaded language, false dichotomy, manufactured consensus, cherry-picking, and whataboutism.

## GitHub Note

The local model weight files are intentionally ignored because regular GitHub rejects files larger than 100 MB. If your submission requires the trained checkpoint, use Git LFS or provide the model through your course's accepted artifact channel.
