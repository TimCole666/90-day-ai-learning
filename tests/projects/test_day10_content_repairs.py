"""Executable checks for the Day 10 content repairs (findings D10-12-01, -04, -05, -06, -07).

Every fenced Python snippet in the Day 10 activities is run from a fresh private
temporary directory and its stdout must equal the fenced ``text`` block that the
content claims as its output, in all four locale editions.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANGS = ('en', 'ja', 'zh-Hans', 'zh-Hant')
LOCALIZED = ('ja', 'zh-Hans', 'zh-Hant')
FENCE = re.compile(r'```(python|text)\n(.*?)\n```', re.DOTALL)

# (activity, field holding the code, index of python block) -> (field holding the output, index of text block)
SNIPPET_OUTPUTS = {
    ('day-10-act-02', 'exercise_prompt', 0): ('answer', 0),
    ('day-10-act-02', 'answer', 0): ('answer', 1),
    ('day-10-act-03', 'exercise_prompt', 0): ('answer', 0),
    ('day-10-act-03', 'answer', 0): ('answer', 1),
    ('day-10-act-04', 'answer', 0): ('answer', 0),
}

ACT01_PREFIX = (
    'count = 0\n'
    'with open("notes.txt", encoding="utf-8") as f:\n'
    '    for line in f:\n'
    '        if line.strip():\n'
    '            count += 1\n'
    'print(count, f.closed)\n'
)


def load(lang):
    return json.loads((ROOT / 'curriculum/content/day-10' / f'{lang}.json').read_text(encoding='utf-8'))


def blocks(text, kind):
    return [body for lang, body in FENCE.findall(text) if lang == kind]


def run_python(source, fixtures=None):
    with tempfile.TemporaryDirectory() as tmp:
        for name, data in (fixtures or {}).items():
            Path(tmp, name).write_bytes(data)
        script = Path(tmp, 'snippet.py')
        script.write_text(source, encoding='utf-8')
        env = dict(os.environ, PYTHONIOENCODING='utf-8')
        done = subprocess.run([sys.executable, '-I', str(script)], cwd=tmp, env=env,
                              capture_output=True, text=True, encoding='utf-8', timeout=60)
    return done


class Day10ContentRepairTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.content = {lang: load(lang) for lang in LANGS}
        cls.day = json.loads((ROOT / 'curriculum/days/day-10.json').read_text(encoding='utf-8'))

    def act(self, lang, act_id):
        return self.content[lang]['activities'][act_id]

    def test_structure_matches_english_edition(self):
        en = self.content['en']
        for lang in LOCALIZED:
            other = self.content[lang]
            self.assertEqual(list(other), list(en), lang)
            self.assertEqual(list(other['common']), list(en['common']), lang)
            self.assertEqual(list(other['activities']), list(en['activities']), lang)
            for act_id, act in en['activities'].items():
                self.assertEqual(list(other['activities'][act_id]), list(act), (lang, act_id))
        self.assertEqual(list(en['activities']), [a['id'] for a in self.day['activities']])

    def test_code_and_output_blocks_are_identical_across_locales(self):
        for act_id in self.content['en']['activities']:
            for field in ('instructions', 'exercise_prompt', 'answer'):
                expected = FENCE.findall(self.act('en', act_id)[field])
                for lang in LOCALIZED:
                    self.assertEqual(FENCE.findall(self.act(lang, act_id)[field]), expected, (lang, act_id, field))

    def test_every_snippet_produces_its_claimed_output(self):
        for lang in LANGS:
            for (act_id, field, index), (out_field, out_index) in SNIPPET_OUTPUTS.items():
                with self.subTest(lang=lang, act=act_id, field=field):
                    act = self.act(lang, act_id)
                    source = blocks(act[field], 'python')[index]
                    claimed = blocks(act[out_field], 'text')[out_index]
                    done = run_python(source + '\n')
                    self.assertEqual(done.returncode, 0, done.stderr)
                    self.assertEqual(done.stderr, '')
                    self.assertEqual(done.stdout, claimed + '\n')

    def test_every_python_block_is_checked(self):
        for lang in LANGS:
            for act_id, act in self.content[lang]['activities'].items():
                for field in act:
                    count = len(blocks(act[field], 'python'))
                    covered = sum(1 for (a, f, _i) in SNIPPET_OUTPUTS if a == act_id and f == field)
                    self.assertEqual(count, covered, (lang, act_id, field))

    def test_act03_parser_is_self_contained_and_assigns_scores(self):
        for lang in LANGS:
            source = blocks(self.act(lang, 'day-10-act-03')['exercise_prompt'], 'python')[0]
            self.assertIn('tempfile.TemporaryDirectory()', source)
            self.assertIn('scores = {}', source)
            self.assertIn('skipped = []', source)
            self.assertIn('scores[name] = score', source)
            self.assertIn("{'ana': 7, 'cy': 5} [2]", blocks(self.act(lang, 'day-10-act-03')['answer'], 'text')[0])

    def test_references_are_implementations_not_restated_prompts(self):
        for lang in LANGS:
            for act_id in ('day-10-act-02', 'day-10-act-03', 'day-10-act-04'):
                act = self.act(lang, act_id)
                self.assertNotEqual(act['answer'], act['exercise_prompt'], (lang, act_id))
                self.assertTrue(blocks(act['answer'], 'python'), (lang, act_id))
            act02 = blocks(self.act(lang, 'day-10-act-02')['answer'], 'python')[0]
            self.assertIn('BASE = Path(__file__).resolve().parent', act02)
            self.assertIn('notes.unlink()', act02)
            act04 = blocks(self.act(lang, 'day-10-act-04')['answer'], 'python')[0]
            self.assertIn('def summarize_scores(path):', act04)
            self.assertIn('except FileNotFoundError:', act04)
            self.assertNotIn('def summarize_scores', self.act(lang, 'day-10-act-04')['exercise_prompt'])

    def test_act02_uses_a_disposable_fixture_not_the_home_directory(self):
        for lang in LANGS:
            act = self.act(lang, 'day-10-act-02')
            source = blocks(act['exercise_prompt'], 'python')[0]
            self.assertIn('tempfile.TemporaryDirectory()', source)
            self.assertNotIn('Path.home()', source)
            self.assertNotIn('~', source)
        for field in ('instructions', 'exercise_prompt', 'answer'):
            self.assertNotIn('from your home directory', self.act('en', 'day-10-act-02')[field])

    def test_act01_counts_three_with_or_without_final_newline(self):
        for lang in LANGS:
            act = self.act(lang, 'day-10-act-01')
            for field in ('exercise_prompt', 'answer'):
                self.assertTrue(act[field].startswith(ACT01_PREFIX), (lang, field))
            self.assertIn('"alpha\\nbeta\\ngamma"', act['instructions'], lang)
            self.assertIn("'gamma'", act['instructions'], lang)
        for data in (b'alpha\nbeta\ngamma\n', b'alpha\nbeta\ngamma'):
            done = run_python(ACT01_PREFIX, {'notes.txt': data})
            self.assertEqual((done.returncode, done.stdout), (0, '3 True\n'), done.stderr)
        last = run_python(
            'with open("notes.txt", encoding="utf-8") as f:\n    print(repr(list(f)[-1]))\n',
            {'notes.txt': b'alpha\nbeta\ngamma'})
        self.assertEqual(last.stdout, "'gamma'\n")

    def test_act03_encoding_claims_are_concrete_and_true(self):
        try:
            b'caf\xe9'.decode('utf-8')
        except UnicodeDecodeError as exc:
            message = f'UnicodeDecodeError: {exc}'
        else:  # pragma: no cover - would mean the claim is false
            self.fail('b"caf\\xe9" unexpectedly decoded as UTF-8')
        self.assertEqual(b'plain'.decode('utf-8'), b'plain'.decode('latin-1'))
        self.assertEqual(b'caf\xc3\xa9'.decode('utf-8'), 'caf\u00e9')
        self.assertEqual(b'caf\xc3\xa9'.decode('latin-1'), 'caf\u00c3\u00a9')
        for lang in LANGS:
            text = self.act(lang, 'day-10-act-03')['instructions']
            self.assertIn("b'caf\\xe9'", text, lang)
            self.assertIn(message, text, lang)
            self.assertIn("b'caf\\xc3\\xa9'", text, lang)
            self.assertIn('caf\u00c3\u00a9', text, lang)
            self.assertNotIn('invalid continuation byte', text, lang)

    def test_localized_prerequisites_and_policy_labels(self):
        cjk = re.compile(r'[\u3040-\u30ff\u4e00-\u9fff]')
        policies = {a['id']: a['assistance_policy'] for a in self.day['activities']}
        independent_marker = {'ja': '独立習得チェック', 'zh-Hans': '独立掌握检查', 'zh-Hant': '獨立掌握檢查'}
        for lang in LOCALIZED:
            for act_id, act in self.content[lang]['activities'].items():
                en = self.act('en', act_id)
                for field in ('prerequisites', 'assistance_policy_label'):
                    self.assertNotEqual(act[field], en[field], (lang, act_id, field))
                    self.assertRegex(act[field], cjk, (lang, act_id, field))
                label = act['assistance_policy_label']
                if policies[act_id] == 'independent':
                    self.assertIn(independent_marker[lang], label, (lang, act_id))
                    self.assertIn('AI', label, (lang, act_id))
                else:
                    self.assertEqual(policies[act_id], 'agent_assisted')
                    self.assertNotIn(independent_marker[lang], label, (lang, act_id))
        for act_id, policy in policies.items():
            label = self.act('en', act_id)['assistance_policy_label']
            self.assertEqual(label.startswith('Independent Mastery Check'), policy == 'independent', act_id)


if __name__ == '__main__':
    unittest.main()
