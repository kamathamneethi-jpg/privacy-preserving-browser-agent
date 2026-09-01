from pathlib import Path
from collections import Counter


ROOT = Path(
    "datasets/webpii_yolo"
)

CLASS_NAMES = [
    "NAME",
    "EMAIL",
    "PHONE",
    "ADDRESS",
    "LOCATION",
    "POSTCODE",
    "DATE_OF_BIRTH",
    "PAYMENT_CARD",
    "SECURITY_CODE",
    "USERNAME",
    "PASSWORD",
    "PROMO_CODE",
    "GIFT_CODE",
    "COMPANY",
    "COUNTRY",
    "OTHER_PII",
]


def count_classes(split):

    label_dir = (
        ROOT
        / "labels"
        / split
    )

    counter = Counter()

    for file in label_dir.glob("*.txt"):

        with open(
            file,
            "r",
            encoding="utf-8"
        ) as f:

            for line in f:

                parts = line.strip().split()

                if len(parts) != 5:
                    continue

                class_id = int(parts[0])

                counter[class_id] += 1

    return counter


for split in ["train", "test"]:

    counter = count_classes(split)

    print()
    print("=" * 60)
    print(split.upper())
    print("=" * 60)

    total = sum(counter.values())

    for class_id, name in enumerate(CLASS_NAMES):

        count = counter[class_id]

        percentage = (
            count / total * 100
            if total
            else 0
        )

        print(
            f"{class_id:2d} "
            f"{name:20s} "
            f"{count:8,d} "
            f"({percentage:6.2f}%)"
        )

    print("-" * 60)
    print(
        f"TOTAL: {total:,}"
    )
