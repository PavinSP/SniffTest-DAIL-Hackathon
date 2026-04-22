import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path


CATEGORIES = [
    "loaded language",
    "false dichotomy",
    "manufactured consensus",
    "cherry-picking",
    "whataboutism",
]


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


def split_items(items, train_ratio, valid_ratio, test_ratio, seed):
    total_ratio = train_ratio + valid_ratio + test_ratio
    if abs(total_ratio - 1.0) > 1e-9:
        raise ValueError("train, validation, and test ratios must add up to 1.0")

    grouped = defaultdict(list)
    skipped = Counter()
    for item in items:
        category = normalize_category(item.get("category"))
        if category is None:
            skipped[item.get("category", "<missing>")] += 1
            continue
        copied = dict(item)
        copied["category"] = category
        grouped[category].append(copied)

    rng = random.Random(seed)
    splits = {"train": [], "valid": [], "test": []}

    for category in CATEGORIES:
        category_items = grouped[category]
        if len(category_items) < 3:
            raise ValueError(f"Need at least 3 examples for {category}; found {len(category_items)}")

        rng.shuffle(category_items)
        test_count = max(1, round(len(category_items) * test_ratio))
        valid_count = max(1, round(len(category_items) * valid_ratio))
        train_count = len(category_items) - valid_count - test_count

        if train_count < 1:
            raise ValueError(f"Split ratios left no training examples for {category}")

        splits["test"].extend(category_items[:test_count])
        splits["valid"].extend(category_items[test_count : test_count + valid_count])
        splits["train"].extend(category_items[test_count + valid_count :])

    for split_items_ in splits.values():
        rng.shuffle(split_items_)

    return splits, skipped


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def distribution(items):
    return dict(Counter(item["category"] for item in items))


def parse_args():
    parser = argparse.ArgumentParser(description="Create stratified train/valid/test splits from train_categorized.json.")
    parser.add_argument("--input", default="data/train_categorized.json")
    parser.add_argument("--output-dir", default="data_split")
    parser.add_argument("--train-ratio", type=float, default=0.8)
    parser.add_argument("--valid-ratio", type=float, default=0.1)
    parser.add_argument("--test-ratio", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main():
    args = parse_args()
    with open(args.input, "r", encoding="utf-8") as handle:
        items = json.load(handle)

    splits, skipped = split_items(
        items=items,
        train_ratio=args.train_ratio,
        valid_ratio=args.valid_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
    )

    output_dir = Path(args.output_dir)
    write_json(output_dir / "train_categorized.json", splits["train"])
    write_json(output_dir / "valid_categorized.json", splits["valid"])
    write_json(output_dir / "test_categorized.json", splits["test"])
    write_json(
        output_dir / "split_summary.json",
        {
            "source": args.input,
            "seed": args.seed,
            "ratios": {
                "train": args.train_ratio,
                "valid": args.valid_ratio,
                "test": args.test_ratio,
            },
            "counts": {name: len(split_items_) for name, split_items_ in splits.items()},
            "distribution": {name: distribution(split_items_) for name, split_items_ in splits.items()},
            "skipped": dict(skipped),
        },
    )

    print(json.dumps(json.load(open(output_dir / "split_summary.json", encoding="utf-8")), indent=2))


if __name__ == "__main__":
    main()
