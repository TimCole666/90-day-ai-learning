"""F6 (acceptance review): thin days get specific steps, a time plan and full worked answers.

The owner chose "enrich, keep 120 min": every activity stays a 120-minute block in the
ledger, and its instructions now say how those minutes are spent (reading, exercise,
check). Days 16-18 lose the shared boilerplate instruction.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")

TIME_PLAN_DAYS = (16, 17, 18, 47, 59, 60, 65, 66, 67)
THIN_ANSWER_DAYS = (16, 17, 47, 59, 60, 65, 66, 67)
BOILERPLATE_DAYS = (16, 17, 18)

BOILERPLATE = {
    "en": "State assumptions, predict before calculating or running code",
    "ja": "仮定を述べ、計算やコード実行の前に予測し",
    "zh-Hans": "先说明假设，在计算或运行代码前先预测",
    "zh-Hant": "先說明假設，在計算或執行程式碼前先預測",
}

TIME_PLAN = {
    "en": r"Time plan \((\d+) min\): reading (\d+) \+ exercise (\d+) \+ check (\d+)",
    "ja": r"時間配分（(\d+) 分）：読解 (\d+) \+ 演習 (\d+) \+ 確認 (\d+)",
    "zh-Hans": r"时间安排（(\d+) 分钟）：阅读 (\d+) \+ 练习 (\d+) \+ 检查 (\d+)",
    "zh-Hant": r"時間安排（(\d+) 分鐘）：閱讀 (\d+) \+ 練習 (\d+) \+ 檢查 (\d+)",
}

# Course median of the per-day English answer total is about 1745 characters.
MIN_DAY_ANSWER_CHARS = 1745
MIN_ACTIVITY_ANSWER_CHARS = 400
# CJK text is denser than English; a full translation is well above this ratio.
MIN_LOCALE_RATIO = 0.3

F6_REVISION = "2026.11.01-rev3"


def content(day, locale):
    path = ROOT / f"curriculum/content/day-{day:02d}/{locale}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def ledger(day):
    return json.loads((ROOT / f"curriculum/days/day-{day:02d}.json").read_text(encoding="utf-8"))


class ThinAnswerEnrichmentTest(unittest.TestCase):
    def test_days_16_to_18_have_no_boilerplate_instruction(self):
        for day in BOILERPLATE_DAYS:
            for locale in LOCALES:
                acts = content(day, locale)["activities"]
                texts = [a["instructions"] for a in acts.values()]
                for act_id, text in zip(acts, texts):
                    self.assertNotIn(BOILERPLATE[locale], text, f"{act_id} {locale}")
                self.assertEqual(len(set(texts)), len(texts), f"day {day} {locale}: instructions must differ")

    def test_every_activity_has_a_time_plan_matching_the_ledger(self):
        for day in TIME_PLAN_DAYS:
            minutes = {a["id"]: a["active_minutes"] for a in ledger(day)["activities"]}
            for act_id, total in minutes.items():
                plans = {}
                for locale in LOCALES:
                    text = content(day, locale)["activities"][act_id]["instructions"]
                    match = re.search(TIME_PLAN[locale], text)
                    if match is None:
                        self.fail(f"{act_id} {locale} has no time plan")
                    stated, *parts = map(int, match.groups())
                    self.assertEqual(stated, total, f"{act_id} {locale}")
                    self.assertEqual(sum(parts), total, f"{act_id} {locale}: parts must sum to {total}")
                    plans[locale] = parts
                self.assertEqual(len({tuple(p) for p in plans.values()}), 1, f"{act_id}: plans differ by locale")

    def test_answers_are_full_worked_answers(self):
        for day in THIN_ANSWER_DAYS:
            english = content(day, "en")["activities"]
            total = sum(len(a["answer"]) for a in english.values())
            self.assertGreaterEqual(total, MIN_DAY_ANSWER_CHARS, f"day {day} en answer total")
            for act_id, act in english.items():
                self.assertGreaterEqual(len(act["answer"]), MIN_ACTIVITY_ANSWER_CHARS, f"{act_id} en")
            for locale in LOCALES[1:]:
                for act_id, act in content(day, locale)["activities"].items():
                    ratio = len(act["answer"]) / len(english[act_id]["answer"])
                    self.assertGreaterEqual(ratio, MIN_LOCALE_RATIO, f"{act_id} {locale} looks condensed")

    def test_enriched_activities_carry_the_f6_revision(self):
        for day in TIME_PLAN_DAYS:
            for act in ledger(day)["activities"]:
                # These three F6 activities received new source-study directions.
                source_revised = {'day-16-act-02', 'day-17-act-01', 'day-67-act-01'}
                expected = '2026.11.01-rev5' if act['id'] in source_revised else F6_REVISION
                self.assertEqual(act["content_revision"], expected, act["id"])
                self.assertEqual(act["active_minutes"], 120, act["id"])


if __name__ == "__main__":
    unittest.main()
