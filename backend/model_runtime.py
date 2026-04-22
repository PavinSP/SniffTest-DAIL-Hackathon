from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def choose_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class LiarCategoryPredictor:
    def __init__(self, model_dir="model_augmented_v2/final", max_length=256):
        self.model_dir = Path(model_dir)
        self.max_length = max_length
        self.device = choose_device()
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_dir, local_files_only=True)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_dir, local_files_only=True)
        self.model.to(self.device)
        self.model.eval()
        self.id2label = {int(key): value for key, value in self.model.config.id2label.items()}

    def predict(self, statements):
        encoded = self.tokenizer(
            statements,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt",
        )
        encoded = {key: value.to(self.device) for key, value in encoded.items()}

        with torch.no_grad():
            logits = self.model(**encoded).logits
            probabilities = torch.softmax(logits, dim=-1).cpu()

        results = []
        for statement, probs in zip(statements, probabilities):
            predicted_id = int(torch.argmax(probs).item())
            results.append(
                {
                    "statement": statement,
                    "predicted_category": self.id2label[predicted_id],
                    "confidence": round(float(probs[predicted_id]), 6),
                    "probabilities": {
                        self.id2label[index]: round(float(probability), 6)
                        for index, probability in enumerate(probs)
                    },
                }
            )
        return results
