import json
from pathlib import Path
from pprint import pprint

ROOT = Path(
    "~/Desktop/sih/datasets/Mind2Web/data"
).expanduser()

file = next(
    (ROOT / "train").glob("*.json")
)

with open(
    file,
    "r",
    encoding="utf-8"
) as f:
    data = json.load(f)

sample = data[0]

print("=" * 70)
print("TASK")
print("=" * 70)

print(sample["confirmed_task"])

print("\n" + "=" * 70)
print("NUMBER OF ACTIONS")
print("=" * 70)

print(len(sample["actions"]))

print("\n" + "=" * 70)
print("FIRST ACTION")
print("=" * 70)

pprint(
    sample["actions"][0],
    depth=4
)