import json
import math
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANGS = ('en', 'ja', 'zh-Hans', 'zh-Hant')
REQUIRED = {'title', 'prerequisites', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'}


def _forward(f, x, h):
    return (f(x + h) - f(x)) / h


def _backward(f, x, h):
    return (f(x) - f(x - h)) / h


def _central(f, x, h):
    return (f(x + h) - f(x - h)) / (2 * h)


class FunctionsLimitsStudyDaysTests(unittest.TestCase):
    def test_ledger_structure_and_status(self):
        for number in (16, 17, 18):
            day_id = f'day-{number:02d}'
            day = json.loads((ROOT / 'curriculum/days' / f'{day_id}.json').read_text())
            self.assertEqual(day['status'], 'available')
            self.assertEqual(day['active_minutes'], 480)
            self.assertEqual(sum(a['active_minutes'] for a in day['activities']), 480)
            self.assertEqual(day['prerequisites'], [f'day-{number - 1:02d}'])
            self.assertEqual([a['id'] for a in day['activities']], [f'{day_id}-act-{i:02d}' for i in range(1, 5)])
            self.assertTrue(all(a['category'] == 'mathematics' for a in day['activities']))
            self.assertTrue(all(a['status'] == 'available' for a in day['activities']))
            self.assertTrue(all(len(a['source_resources']) >= 1 for a in day['activities']))

    def test_four_editions_preserve_activity_ids_and_fields(self):
        for number in (16, 17, 18):
            day_id = f'day-{number:02d}'
            editions = [json.loads((ROOT / 'curriculum/content' / day_id / f'{lang}.json').read_text()) for lang in LANGS]
            ids = set(editions[0]['activities'])
            self.assertEqual(len(ids), 4)
            for content, lang in zip(editions, LANGS, strict=True):
                self.assertEqual(content['language'], lang)
                self.assertEqual(set(content['activities']), ids)
                for activity in content['activities'].values():
                    self.assertTrue(set(activity) >= REQUIRED)

    def test_day16_function_table_secant_and_bridge_values(self):
        f = lambda x: x ** 2 + 1
        self.assertEqual([f(x) for x in (-2, -1, 0, 1, 2)], [5, 2, 1, 2, 5])
        self.assertAlmostEqual((f(5) - f(2)) / (5 - 2), 7.0)
        p = lambda x: x ** 2
        self.assertAlmostEqual((p(3.1) - p(3)) / 0.1, 6.1)
        self.assertAlmostEqual(((3 + 0.1) ** 2 - 9) / 0.1, 6.1)
        g = lambda x: (x ** 2 - 1) / (x - 1)
        nearby = [round(g(x), 2) for x in (0.9, 0.99, 1.01, 1.1)]
        self.assertEqual(nearby, [1.9, 1.99, 2.01, 2.1])

    def test_day17_derivative_rules_and_abs_counterexample(self):
        self.assertAlmostEqual(_forward(lambda x: 3 * x, 0.0, 1e-7), 3.0, places=4)
        self.assertAlmostEqual(_central(lambda x: x ** 3, 2.0, 1e-4), 12.0, places=4)
        left = _backward(abs, 0.0, 1e-6)
        right = _forward(abs, 0.0, 1e-6)
        self.assertAlmostEqual(left, -1.0, places=5)
        self.assertAlmostEqual(right, 1.0, places=5)
        self.assertNotAlmostEqual(left, right, places=5)

    def test_day18_finite_difference_table_and_step_tradeoff(self):
        sq = lambda x: x ** 2
        self.assertAlmostEqual(_forward(sq, 3.0, 0.1), 6.1)
        self.assertAlmostEqual(_backward(sq, 3.0, 0.1), 5.9)
        self.assertAlmostEqual(_central(sq, 3.0, 0.1), 6.0)
        reference = math.cos(1.0)
        estimates = {h: _central(math.sin, 1.0, h) for h in (0.1, 1e-3, 1e-5, 1e-8, 1e-12)}
        self.assertAlmostEqual(estimates[0.1], 0.5394022522, places=8)
        self.assertAlmostEqual(estimates[1e-3], 0.5403022158, places=8)
        self.assertAlmostEqual(estimates[1e-5], reference, places=8)
        self.assertLess(abs(estimates[1e-12] - reference), 1e-3)
        self.assertGreater(abs(estimates[0.1] - reference), abs(estimates[1e-5] - reference))
        cancel = _forward(lambda h: math.sqrt(1 + h) - 1.0, 0.0, 1e-16)
        self.assertNotAlmostEqual(cancel, 0.5, places=3)

    def test_manifest_and_review_record_are_published(self):
        manifest = json.loads((ROOT / 'curriculum/manifest.json').read_text())
        lessons = {item['id']: item for item in manifest['lessons']}
        for number in (16, 17, 18):
            self.assertEqual(lessons[f'les-{number:02d}']['status'], 'available')
        review = (ROOT / 'curriculum/reviews/functions-limits-days-16-18.md').read_text()
        for marker in ('Day 16', 'Day 17', 'Day 18', 'nondifferentiable', 'truncation', 'Four-language translation review', 'OpenStax'):
            self.assertIn(marker, review)


if __name__ == '__main__':
    unittest.main()
