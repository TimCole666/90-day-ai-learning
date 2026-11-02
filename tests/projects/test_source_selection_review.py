"""Traceable internal selection decisions, not an automated proof of quality."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANGS = ('en', 'ja', 'zh-Hans', 'zh-Hant')
DOC = ROOT / 'curriculum/reviews/source-selection-review.md'
ANCHORS = {
    (4, 1): 'automate-boring-stuff-3e',
    (8, 1): 'automate-boring-stuff-3e',
    (17, 1): 'mit-ocw-18-01sc',
    (25, 2): 'harvard-stat110-practice',
    (43, 1): 'stanford-cs224n',
    (61, 1): 'huggingface-llm-course-finetuning',
    (70, 1): 'huggingface-evaluation-guidebook',
    (73, 1): 'huggingface-agents-course',
    (82, 1): 'anthropic-agent-evals-2026',
}


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


class SourceSelectionReviewTest(unittest.TestCase):
    def test_new_teaching_sources_are_used_in_every_edition(self):
        for (day, number), source in ANCHORS.items():
            aid = f'day-{day:02d}-act-{number:02d}'
            ledger = next(a for a in load(ROOT / f'curriculum/days/day-{day:02d}.json')['activities']
                          if a['id'] == aid)
            for lang in LANGS:
                with self.subTest(day=day, lang=lang, source=source):
                    act = load(ROOT / f'curriculum/content/day-{day:02d}/{lang}.json')['activities'][aid]
                    visible = act.get('source_resources', ledger['source_resources'])
                    card = next((c for c in visible if c['id'] == source), None)
                    self.assertIsNotNone(card)
                    if card is not None:
                        self.assertTrue(card.get('relevant_timestamp'))
                    marker = {'en': 'Study source:', 'ja': '参照資料:',
                              'zh-Hans': '学习来源：', 'zh-Hant': '學習來源：'}[lang]
                    self.assertIn(marker, act['instructions'])

    def test_cs336_leads_relevant_exercises_at_the_verified_tag(self):
        for day, number in ((50, 2), (51, 1), (55, 1)):
            aid = f'day-{day:02d}-act-{number:02d}'
            act = next(a for a in load(ROOT / f'curriculum/days/day-{day:02d}.json')['activities']
                       if a['id'] == aid)
            with self.subTest(activity=aid):
                first = act['source_resources'][0]
                self.assertEqual(first['id'], 'cs336-basics')
                self.assertEqual(first['original_url'],
                                 'https://github.com/stanford-cs336/assignment1-basics/tree/spring2025')
                self.assertEqual(first['license'], 'MIT')
                self.assertNotIn('9f72ab3', first['relevant_timestamp'])

    def test_all_blocks_record_teaching_roles_and_specific_decisions(self):
        matrix = load(ROOT / 'curriculum/sources/comparison-matrix.json')
        self.assertEqual(matrix['requirement_status'], 'partially satisfied; expert review pending.')
        self.assertTrue(DOC.exists(), 'internal decisions must be available, not only scores')
        text = DOC.read_text(encoding='utf-8')
        headings = re.findall(r'^## (b\d\d-[a-z0-9-]+):', text, re.M)
        self.assertEqual(headings, [b['id'] for b in matrix['blocks']])
        for block in matrix['blocks']:
            with self.subTest(block=block['id']):
                self.assertTrue(block['teaching_sources'])
                self.assertTrue(set(block['teaching_sources']) <= set(block['selected']))
                body = text.split('## ' + block['id'] + ':', 1)[1].split('\n## ', 1)[0]
                for name in ('Decision', 'Stronger or close alternatives', 'Evidence', 'Change', 'Uncertainty'):
                    self.assertRegex(body, rf'\*\*{name}:\*\* .{{15,}}')
        self.assertIn('## Remaining gaps', text)
        self.assertIn('partially satisfied; expert review pending.', text)
        self.assertIn('not a prerequisite', text)

    def test_acceptance_spec_keeps_strict_requirement_without_expert_gate(self):
        spec = (ROOT / '.scratch/90-day-ai-learning/spec.md').read_text(encoding='utf-8')
        story = next(line for line in spec.splitlines() if line.startswith('60. '))
        self.assertIn('highest-quality publicly available', story)
        self.assertNotIn('Open conflict', story)
        self.assertNotIn('No final approval of source quality', spec)
        self.assertNotIn('cannot be approved before', spec)
        self.assertNotIn('until expert review', spec)


if __name__ == '__main__':
    unittest.main()
