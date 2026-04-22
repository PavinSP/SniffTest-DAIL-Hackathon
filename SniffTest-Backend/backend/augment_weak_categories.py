import argparse
import json
import random
import shutil
from collections import Counter
from pathlib import Path


WEAK_CATEGORIES = {
    "false dichotomy": {
        "explanation": "The statement frames the situation as only two choices, ignoring other realistic options.",
        "templates": [
            "Either we {action}, or {bad_outcome}.",
            "There are only two choices: {action} or {bad_outcome}.",
            "Anyone who does not {action} is choosing {bad_outcome}.",
            "We must {action}; the only alternative is {bad_outcome}.",
            "If leaders refuse to {action}, then they are accepting {bad_outcome}.",
            "The debate is simple: {action} or watch {bad_outcome}.",
            "A vote against {action} is a vote for {bad_outcome}.",
            "You are either with the people who want to {action}, or you support {bad_outcome}.",
            "{bad_outcome} happened only because officials failed to {action}.",
            "The only reason for {bad_outcome} is that leaders would not {action}.",
            "If {action} worked before, then refusing it now can only mean {bad_outcome}.",
            "This problem proves we must {action}; no other explanation matters.",
            "The choice is not complicated: {action} or accept responsibility for {bad_outcome}.",
            "Since {bad_outcome} followed the decision, that decision must be the only cause.",
            "Either the policy caused {bad_outcome}, or the critics are lying.",
            "Because leaders did not {action}, every part of {bad_outcome} is their fault.",
        ],
        "actions": [
            "ban the proposal immediately",
            "pass this bill today",
            "close the border now",
            "approve the emergency plan",
            "cut the program entirely",
            "support the mayor's plan",
            "reject the new policy",
            "fund the project this week",
            "remove the officials responsible",
            "raise the penalties right away",
            "freeze the budget",
            "stop the new rule",
            "back this reform",
            "cancel the contract",
            "vote for the security package",
            "adopt the governor's proposal",
            "block the tax increase",
            "defend the current law",
            "end the program now",
            "approve the school policy",
        ],
        "bad_outcomes": [
            "families losing everything",
            "crime taking over our neighborhoods",
            "the economy collapsing",
            "children being put at risk",
            "taxpayers being punished",
            "our schools falling apart",
            "jobs disappearing across the state",
            "corruption spreading unchecked",
            "dangerous chaos in every community",
            "small businesses being destroyed",
            "our rights being taken away",
            "public safety being abandoned",
            "the city going bankrupt",
            "politicians ignoring ordinary people",
            "health care becoming impossible to afford",
            "working families being left behind",
            "foreign competitors controlling our future",
            "the justice system failing victims",
            "voters losing their voice",
            "the crisis getting worse",
        ],
    },
    "manufactured consensus": {
        "explanation": "The statement claims broad agreement without evidence, creating the impression that dissent does not exist.",
        "templates": [
            "Everyone knows that {claim}.",
            "No serious person disagrees that {claim}.",
            "The public has already decided that {claim}.",
            "Experts across the country all agree that {claim}.",
            "Voters are united behind the fact that {claim}.",
            "It is settled among ordinary people that {claim}.",
            "Every responsible leader understands that {claim}.",
            "There is no real debate anymore: {claim}.",
            "The whole community agrees that {claim}.",
            "People from every background accept that {claim}.",
            "The unanimous vote proves that {claim}.",
            "A panel of officials confirmed what everyone already knew: {claim}.",
            "The survey numbers show that all taxpayers understand {claim}.",
            "Every county official reached the same conclusion that {claim}.",
            "The business community speaks with one voice when it says {claim}.",
            "The court's one-sided decision shows there is no disagreement that {claim}.",
            "Nobody in the field believes anything except that {claim}.",
            "The data settles the matter for every household: {claim}.",
            "When every expert source says the same thing, it proves {claim}.",
            "The recommendation from the committee means the public accepts that {claim}.",
        ],
        "claims": [
            "this policy is the only sensible path forward",
            "the mayor's plan has already earned public support",
            "the new tax is clearly necessary",
            "the investigation should be closed immediately",
            "the project will benefit every neighborhood",
            "the opposition's concerns have been rejected",
            "this reform is what families want",
            "the budget cuts are obviously the right choice",
            "the school board made the only reasonable decision",
            "the new law has overwhelming support",
            "the governor's approach is the accepted solution",
            "the city cannot afford any other option",
            "the committee's recommendation is beyond dispute",
            "the current leadership has failed completely",
            "the proposal is supported by real taxpayers",
            "the issue was settled by common sense",
            "the community wants stronger enforcement",
            "the plan is trusted by everyone paying attention",
            "the opposition is outside the mainstream",
            "the agreement proves the policy is correct",
            "the reform has support from all reasonable citizens",
            "the evidence convinced everyone who looked at it",
            "the program deserves to be expanded",
            "the campaign's message represents the entire district",
            "the public is tired of hearing objections",
        ],
    },
    "whataboutism": {
        "explanation": "The statement deflects criticism by pointing to another issue or another group's behavior instead of addressing the original claim.",
        "templates": [
            "Why focus on {issue} when {other_group} did {other_issue}?",
            "Before criticizing {target}, explain why {other_group} got away with {other_issue}.",
            "You complain about {issue}, but what about {other_group} and {other_issue}?",
            "How can you attack {target} for {issue} after ignoring {other_group}'s {other_issue}?",
            "This outrage over {issue} is fake unless you also condemn {other_group} for {other_issue}.",
            "People keep talking about {issue}, but nobody mentions how {other_group} caused {other_issue}.",
            "Why should anyone answer for {issue} when {other_group} never answered for {other_issue}?",
            "It is hypocritical to discuss {issue} while staying silent about {other_group}'s {other_issue}.",
            "The real question is not {issue}; it is why {other_group} was allowed to create {other_issue}.",
            "If {target} must explain {issue}, then {other_group} should first explain {other_issue}.",
        ],
        "issues": [
            "this spending mistake",
            "the mayor's ethics complaint",
            "the new misinformation claim",
            "this failed policy",
            "the questionable contract",
            "the police department scandal",
            "the campaign finance problem",
            "the school funding dispute",
            "the broken campaign promise",
            "the environmental violation",
            "this immigration decision",
            "the health care rollout",
            "the tax increase",
            "the housing shortage",
            "the foreign policy failure",
            "the voting rule change",
            "the unemployment numbers",
            "the corruption allegation",
            "the public safety failure",
            "the budget deficit",
        ],
        "targets": [
            "this administration",
            "the governor",
            "the mayor",
            "the council",
            "the senator",
            "the agency",
            "the campaign",
            "the committee",
            "the school board",
            "the department",
        ],
        "other_groups": [
            "the previous administration",
            "the other party",
            "their own allies",
            "the last governor",
            "the city council majority",
            "the federal government",
            "the opposition campaign",
            "their favorite senator",
            "the former mayor",
            "the same activists",
            "the media",
            "their donors",
            "the prior committee",
            "neighboring states",
            "the last school board",
        ],
        "other_issues": [
            "a bigger budget disaster",
            "worse ethics violations",
            "years of false claims",
            "a much larger policy failure",
            "secret contracts",
            "a scandal nobody investigated",
            "campaign finance abuses",
            "cuts to the same schools",
            "broken promises from last year",
            "pollution they ignored",
            "a harsher immigration policy",
            "a failed health care plan",
            "tax hikes they supported",
            "a worse housing crisis",
            "foreign policy mistakes",
            "voting restrictions",
            "bad job numbers",
            "corruption in their own ranks",
            "public safety failures",
            "deficits they created",
        ],
    },
}


def generate_examples(category, existing_count, target_count, seed):
    config = WEAK_CATEGORIES[category]
    rng = random.Random(f"{seed}:{category}")
    generated = []
    seen = set()

    while existing_count + len(generated) < target_count:
        template = rng.choice(config["templates"])
        values = {}
        for field in ["actions", "bad_outcomes", "claims", "issues", "targets", "other_groups", "other_issues"]:
            if field in config:
                value_key = field[:-1] if field.endswith("s") else field
                if field == "bad_outcomes":
                    value_key = "bad_outcome"
                elif field == "other_groups":
                    value_key = "other_group"
                elif field == "other_issues":
                    value_key = "other_issue"
                values[value_key] = rng.choice(config[field])

        statement = template.format(**values)
        if statement in seen:
            continue
        seen.add(statement)
        generated.append(
            {
                "original_label": "synthetic",
                "statement": statement,
                "category": category,
                "explanation": config["explanation"],
            }
        )

    return generated


def parse_args():
    parser = argparse.ArgumentParser(description="Augment weak LIAR manipulation categories in the training split.")
    parser.add_argument("--source-dir", default="data")
    parser.add_argument("--output-dir", default="data_augmented_v2")
    parser.add_argument("--target-count", type=int, default=220)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main():
    args = parse_args()
    source_dir = Path(args.source_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(source_dir / "train_categorized.json", "r", encoding="utf-8") as handle:
        train_data = json.load(handle)

    counts = Counter(item.get("category") for item in train_data)
    additions = []
    for category in WEAK_CATEGORIES:
        additions.extend(generate_examples(category, counts[category], args.target_count, args.seed))

    rng = random.Random(args.seed)
    augmented_train = train_data + additions
    rng.shuffle(augmented_train)

    with open(output_dir / "train_categorized.json", "w", encoding="utf-8") as handle:
        json.dump(augmented_train, handle, indent=2, ensure_ascii=False)

    shutil.copyfile(source_dir / "valid_categorized.json", output_dir / "valid_categorized.json")
    shutil.copyfile(source_dir / "test_categorized.json", output_dir / "test_categorized.json")

    summary = {
        "source_dir": str(source_dir),
        "target_count_for_weak_categories": args.target_count,
        "added_examples": Counter(item["category"] for item in additions),
        "final_train_distribution": Counter(item.get("category") for item in augmented_train),
        "note": "Synthetic examples are added only to the training split. Validation and test are copied unchanged.",
    }
    summary = {
        key: dict(value) if isinstance(value, Counter) else value
        for key, value in summary.items()
    }
    with open(output_dir / "augmentation_summary.json", "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, ensure_ascii=False)

    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
