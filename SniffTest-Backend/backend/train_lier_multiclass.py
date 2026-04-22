import argparse
import csv
import json
import os
import random
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch
from datasets import Dataset, DatasetDict
from sklearn.metrics import accuracy_score, classification_report, precision_recall_fscore_support
from transformers import (
    AutoConfig,
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
    set_seed,
)


CATEGORIES = [
    "loaded language",
    "false dichotomy",
    "manufactured consensus",
    "cherry-picking",
    "whataboutism",
]

LABEL2ID = {label: idx for idx, label in enumerate(CATEGORIES)}
ID2LABEL = {idx: label for label, idx in LABEL2ID.items()}
SCRIPT_DIR = Path(__file__).resolve().parent


def normalize_category(value):
    if not value:
        return None

    normalized = value.strip().lower().replace("_", " ")
    normalized = " ".join(normalized.split())

    aliases = {
        "loaded language": "loaded language",
        "false dichotomy": "false dichotomy",
        "manufactured consensus": "manufactured consensus",
        "cherry picking": "cherry-picking",
        "cherry-picking": "cherry-picking",
        "whataboutism": "whataboutism",
    }
    return aliases.get(normalized)


def load_split(path):
    with open(path, "r", encoding="utf-8") as handle:
        raw_items = json.load(handle)

    examples = []
    skipped = Counter()
    for item in raw_items:
        category = normalize_category(item.get("category"))
        if category is None:
            skipped[item.get("category", "<missing>")] += 1
            continue

        statement = item.get("statement", "").strip()
        if not statement:
            skipped["<empty statement>"] += 1
            continue

        examples.append(
            {
                "text": statement,
                "label": LABEL2ID[category],
                "category": category,
                "original_label": item.get("original_label", ""),
            }
        )

    return examples, skipped


def oversample_training_examples(examples, seed):
    grouped = defaultdict(list)
    for example in examples:
        grouped[example["label"]].append(example)

    max_count = max(len(items) for items in grouped.values())
    rng = random.Random(seed)
    balanced = []

    for label in sorted(grouped):
        items = list(grouped[label])
        balanced.extend(items)
        needed = max_count - len(items)
        if needed > 0:
            balanced.extend(rng.choices(items, k=needed))

    rng.shuffle(balanced)
    return balanced


def print_distribution(name, examples):
    counts = Counter(example["label"] for example in examples)
    pretty = {ID2LABEL[label]: counts.get(label, 0) for label in range(len(CATEGORIES))}
    print(f"{name}: {len(examples)} examples -> {pretty}")


def compute_metrics(eval_prediction):
    logits, labels = eval_prediction
    predictions = np.argmax(logits, axis=-1)
    precision, recall, macro_f1, _ = precision_recall_fscore_support(
        labels,
        predictions,
        average="macro",
        zero_division=0,
    )
    weighted_f1 = precision_recall_fscore_support(
        labels,
        predictions,
        average="weighted",
        zero_division=0,
    )[2]
    return {
        "accuracy": accuracy_score(labels, predictions),
        "macro_f1": macro_f1,
        "weighted_f1": weighted_f1,
        "macro_precision": precision,
        "macro_recall": recall,
    }


class ClassWeightedTrainer(Trainer):
    def __init__(self, *args, class_weights=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        weights = self.class_weights.to(outputs.logits.device) if self.class_weights is not None else None
        loss = torch.nn.functional.cross_entropy(outputs.logits, labels, weight=weights)
        return (loss, outputs) if return_outputs else loss


def resolve_project_path(value):
    path = Path(value)
    if path.is_absolute():
        return path
    return SCRIPT_DIR / path


def resolve_model_source(value):
    path = Path(value)
    if path.is_absolute() and path.exists():
        return str(path), True
    if path.exists():
        return str(path), True

    project_path = SCRIPT_DIR / path
    if project_path.exists():
        return str(project_path), True

    return value, False


def build_model(model_path, local_files_only=False):
    config = AutoConfig.from_pretrained(
        model_path,
        num_labels=len(CATEGORIES),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        local_files_only=local_files_only,
    )
    model = AutoModelForSequenceClassification.from_pretrained(
        model_path,
        config=config,
        ignore_mismatched_sizes=True,
        local_files_only=local_files_only,
    )

    # The copied local checkpoint was trained with the same first five labels plus
    # an extra "Other/Unclear" row. Reuse those five classifier rows when present.
    try:
        old_model = AutoModelForSequenceClassification.from_pretrained(
            model_path,
            local_files_only=local_files_only,
        )
        if hasattr(model, "classifier") and hasattr(old_model, "classifier"):
            old_classifier = old_model.classifier
            new_classifier = model.classifier
            if old_classifier.weight.shape[0] >= len(CATEGORIES):
                with torch.no_grad():
                    new_classifier.weight.copy_(old_classifier.weight[: len(CATEGORIES)])
                    new_classifier.bias.copy_(old_classifier.bias[: len(CATEGORIES)])
        del old_model
    except Exception as exc:
        print(f"Classifier row reuse skipped: {exc}")

    return model


def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def write_predictions(path, examples, labels, predictions, probabilities):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "statement",
                "true_category",
                "predicted_category",
                "confidence",
            ],
        )
        writer.writeheader()
        for example, label, prediction, probs in zip(examples, labels, predictions, probabilities):
            writer.writerow(
                {
                    "statement": example["text"],
                    "true_category": ID2LABEL[int(label)],
                    "predicted_category": ID2LABEL[int(prediction)],
                    "confidence": round(float(np.max(probs)), 6),
                }
            )


def parse_args():
    parser = argparse.ArgumentParser(
        description="Fine-tune DistilBERT for five-class LIAR manipulation-category classification."
    )
    parser.add_argument("--data-dir", default="data_augmented_v2", help="Folder containing train/valid/test categorized JSON files.")
    parser.add_argument("--model-path", default="distilbert-base-uncased", help="Hugging Face model id or local model folder to fine-tune from.")
    parser.add_argument("--output-dir", default="model", help="Folder for checkpoints, final model, and metrics.")
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--epochs", type=float, default=10)
    parser.add_argument("--learning-rate", type=float, default=8e-6)
    parser.add_argument("--weight-decay", type=float, default=0.05)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--eval-batch-size", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-balance", action="store_true", help="Disable minority-class oversampling.")
    parser.add_argument("--class-weights", action="store_true", help="Use inverse-frequency class weights.")
    return parser.parse_args()


def main():
    args = parse_args()
    set_seed(args.seed)

    data_dir = resolve_project_path(args.data_dir)
    output_dir = resolve_project_path(args.output_dir)
    train_examples, train_skipped = load_split(data_dir / "train_categorized.json")
    valid_examples, valid_skipped = load_split(data_dir / "valid_categorized.json")
    test_examples, test_skipped = load_split(data_dir / "test_categorized.json")

    if not train_examples or not valid_examples or not test_examples:
        raise ValueError("Expected non-empty train, validation, and test splits after category filtering.")

    print("\nLoaded five-class data after dropping Other/Unclear:")
    print_distribution("train", train_examples)
    print_distribution("validation", valid_examples)
    print_distribution("test", test_examples)
    print(f"Skipped labels: train={dict(train_skipped)}, validation={dict(valid_skipped)}, test={dict(test_skipped)}")

    training_examples = train_examples
    if not args.no_balance:
        training_examples = oversample_training_examples(train_examples, args.seed)
        print_distribution("balanced train", training_examples)

    dataset = DatasetDict(
        {
            "train": Dataset.from_list(training_examples),
            "validation": Dataset.from_list(valid_examples),
            "test": Dataset.from_list(test_examples),
        }
    )

    model_source, model_local_only = resolve_model_source(args.model_path)
    tokenizer = AutoTokenizer.from_pretrained(model_source, local_files_only=model_local_only)

    def tokenize(batch):
        return tokenizer(
            batch["text"],
            max_length=args.max_length,
            truncation=True,
        )

    tokenized = dataset.map(
        tokenize,
        batched=True,
        remove_columns=["text", "category", "original_label"],
    )

    class_weights = None
    if args.class_weights:
        counts = Counter(example["label"] for example in train_examples)
        total = sum(counts.values())
        weights = [total / (len(CATEGORIES) * counts[label]) for label in range(len(CATEGORIES))]
        class_weights = torch.tensor(weights, dtype=torch.float32)
        print(f"Class weights: {[round(weight, 4) for weight in weights]}")

    model = build_model(model_source, local_files_only=model_local_only)
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        evaluation_strategy="epoch",
        save_strategy="epoch",
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.eval_batch_size,
        num_train_epochs=args.epochs,
        weight_decay=args.weight_decay,
        warmup_ratio=0.1,
        logging_steps=20,
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        greater_is_better=True,
        save_total_limit=2,
        report_to=[],
        seed=args.seed,
        data_seed=args.seed,
    )

    trainer = ClassWeightedTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        class_weights=class_weights,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )

    print("\nFine-tuning model...")
    trainer.train()
    trainer.callback_handler.callbacks = [
        callback
        for callback in trainer.callback_handler.callbacks
        if not isinstance(callback, EarlyStoppingCallback)
    ]

    final_dir = output_dir / "final"
    trainer.save_model(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))

    print("\nEvaluating best checkpoint...")
    validation_metrics = trainer.evaluate(tokenized["validation"], metric_key_prefix="validation")
    test_output = trainer.predict(tokenized["test"], metric_key_prefix="test")
    test_metrics = test_output.metrics

    test_logits = test_output.predictions
    test_labels = test_output.label_ids
    test_predictions = np.argmax(test_logits, axis=-1)
    test_probabilities = torch.softmax(torch.tensor(test_logits), dim=-1).numpy()
    report = classification_report(
        test_labels,
        test_predictions,
        labels=list(range(len(CATEGORIES))),
        target_names=CATEGORIES,
        output_dict=True,
        zero_division=0,
    )

    save_json(output_dir / "metrics" / "validation_metrics.json", validation_metrics)
    save_json(output_dir / "metrics" / "test_metrics.json", test_metrics)
    save_json(output_dir / "metrics" / "test_classification_report.json", report)
    write_predictions(
        output_dir / "predictions" / "test_predictions.csv",
        test_examples,
        test_labels,
        test_predictions,
        test_probabilities,
    )

    print("\nValidation metrics:")
    print(json.dumps(validation_metrics, indent=2))
    print("\nTest metrics:")
    print(json.dumps(test_metrics, indent=2))
    print("\nTest classification report:")
    print(
        classification_report(
            test_labels,
            test_predictions,
            labels=list(range(len(CATEGORIES))),
            target_names=CATEGORIES,
            zero_division=0,
        )
    )
    print(f"\nSaved fine-tuned model to {final_dir}")


if __name__ == "__main__":
    main()
