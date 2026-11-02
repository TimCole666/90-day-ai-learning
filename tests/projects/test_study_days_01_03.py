import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = {'title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'}
LANGUAGES = ('en', 'ja', 'zh-Hans', 'zh-Hant')


class StudyDays01To03Tests(unittest.TestCase):
    def test_first_three_days_have_one_ledger_and_four_equivalent_editions(self):
        for number in (1, 2, 3):
            day_id = f'day-{number:02d}'
            day = json.loads((ROOT / 'curriculum/days' / f'{day_id}.json').read_text())
            self.assertEqual(day['active_minutes'], 480)
            self.assertEqual(sum(item['active_minutes'] for item in day['activities']), 480)
            ids = {item['id'] for item in day['activities']}
            self.assertEqual(len(ids), 4)
            for language in LANGUAGES:
                content = json.loads((ROOT / 'curriculum/content' / day_id / f'{language}.json').read_text())
                self.assertEqual(content['language'], language)
                self.assertEqual(set(content['activities']), ids)
                self.assertTrue(all(set(activity) >= REQUIRED for activity in content['activities'].values()))

    def test_learning_method_and_assistance_boundaries_are_explicit(self):
        text = (ROOT / 'curriculum/content/day-01/en.json').read_text()
        self.assertIn('tracer_bullet', text)
        self.assertIn('prediction', text.lower())
        self.assertIn('Independent Mastery Check', text)
        for day in (2, 3):
            content = json.loads((ROOT / 'curriculum/content' / f'day-{day:02d}/en.json').read_text())
            joined = json.dumps(content).lower()
            self.assertTrue('terminal' in joined or 'filesystem' in joined)
            self.assertIn('agent', joined)


if __name__ == '__main__':
    unittest.main()
