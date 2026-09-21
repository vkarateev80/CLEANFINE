"""Разбор выгрузки треков: интервалы отправки, батарея, покрытие окна."""
import datetime
import json
import statistics
import sys

path = sys.argv[1]
data = json.load(open(path))
tracks = data["tracks"]
stamps = sorted(
    datetime.datetime.fromisoformat(t["timestamp"].replace("Z", "+00:00")) for t in tracks
)
print(f"точек на сервере: {len(stamps)} (userId={data['userId']})")
if len(stamps) > 1:
    gaps = [(stamps[i] - stamps[i - 1]).total_seconds() for i in range(1, len(stamps))]
    print("интервалы между точками, с:", ", ".join(f"{g:.0f}" for g in gaps))
    print(
        f"медиана {statistics.median(gaps):.1f} с, минимум {min(gaps):.1f}, "
        f"максимум {max(gaps):.1f}, всего {sum(gaps):.0f} с"
    )
    buckets = {"<=15": 0, "16-45": 0, "46-70": 0, ">70": 0}
    for g in gaps:
        if g <= 15:
            buckets["<=15"] += 1
        elif g <= 45:
            buckets["16-45"] += 1
        elif g <= 70:
            buckets["46-70"] += 1
        else:
            buckets[">70"] += 1
    print("распределение интервалов:", buckets)
print("значения battery в точках:", {t.get("battery") for t in tracks})
print("значения speed в точках:", sorted({t.get("speed") for t in tracks}))
print("окно:", stamps[0].isoformat() if stamps else "-", "→", stamps[-1].isoformat() if stamps else "-")
print("первые 5:", [t["timestamp"] for t in tracks[:5]])
print("последние 5:", [t["timestamp"] for t in tracks[-5:]])
