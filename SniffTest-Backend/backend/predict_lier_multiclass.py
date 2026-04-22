import argparse
import json
from pathlib import Path

from model_runtime import LiarCategoryPredictor


SCRIPT_DIR = Path(__file__).resolve().parent


def parse_args():
    parser = argparse.ArgumentParser(description="Run local five-class LIAR category inference.")
    parser.add_argument("--model-dir", default="model_augmented_v2/final", help="Fine-tuned model folder.")
    parser.add_argument("--text", help="One statement to classify.")
    parser.add_argument("--input-json", help="Optional JSON list of statements or objects with a 'statement' field.")
    parser.add_argument("--max-length", type=int, default=256)
    return parser.parse_args()


def load_inputs(args):
    if args.text:
        return [args.text]
    if args.input_json:
        with open(args.input_json, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        statements = []
        for item in payload:
            if isinstance(item, str):
                statements.append(item)
            elif isinstance(item, dict) and item.get("statement"):
                statements.append(item["statement"])
        return statements
    raise ValueError("Pass either --text or --input-json.")


def main():
    args = parse_args()
    statements = load_inputs(args)
    model_dir = Path(args.model_dir)
    if not model_dir.is_absolute():
        model_dir = SCRIPT_DIR / model_dir

    predictor = LiarCategoryPredictor(model_dir=model_dir, max_length=args.max_length)
    results = predictor.predict(statements)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
