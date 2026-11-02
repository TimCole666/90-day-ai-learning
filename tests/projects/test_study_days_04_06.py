import copy
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANGS = ('en', 'ja', 'zh-Hans', 'zh-Hant')
REQUIRED = {'title', 'prerequisites', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'}
OPTION_KEYS = ('a', 'b', 'c')


def validate_localized_quizzes(day_id, editions, descriptor, seen_prompts=None):
    """Structural regression evidence, not a language or teaching-quality review."""
    activities = {activity['id']: activity for activity in descriptor['activities']}
    seen_prompts = {} if seen_prompts is None else seen_prompts
    for language, edition in zip(LANGS, editions, strict=True):
        assert set(edition['activities']) == set(activities), f'{day_id}/{language}: activity ids differ from descriptor'
        prompts = seen_prompts.setdefault(language, {})
        for activity_id, metadata in activities.items():
            label = f'{day_id}/{language}/{activity_id}'
            quiz = edition['activities'][activity_id].get('quiz')
            assert isinstance(quiz, dict), f'{label}: missing quiz'
            assert quiz.get('mastery_score') == metadata['quiz']['mastery_score'], f'{label}: mastery score differs from descriptor'
            questions = quiz.get('questions')
            expected_questions = metadata['quiz']['questions']
            assert isinstance(questions, list), f'{label}: missing questions'
            assert len(questions) == len(expected_questions), f'{label}: question count differs from descriptor'
            for expected, question in zip(expected_questions, questions, strict=True):
                label = f'{day_id}/{language}/{activity_id}/{expected["id"]}'
                assert isinstance(question, dict), f'{label}: question must be an object'
                for field in ('id', 'type', 'expected_answer'):
                    assert question.get(field) == expected[field], f'{label}: {field} differs from descriptor'
                assert question['type'] == 'choice', f'{label}: expected a choice question'
                # The actual schema and renderer use prompt, not an implicit prose fallback.
                prompt = question.get('prompt')
                assert isinstance(prompt, str) and prompt.strip(), f'{label}: prompt must be a nonempty string'
                normalized_prompt = ' '.join(prompt.split()).casefold()
                assert normalized_prompt not in prompts, f'{label}: duplicate prompt from {prompts.get(normalized_prompt)}'
                prompts[normalized_prompt] = activity_id
                options = question.get('options')
                assert isinstance(options, dict) and tuple(options) == OPTION_KEYS, f'{label}: options must be ordered a, b, c'
                assert question['expected_answer'] in options, f'{label}: correct answer must identify an option'
                option_text = []
                for key, value in options.items():
                    assert isinstance(value, str) and value.strip(), f'{label}: option {key} must be a nonempty string'
                    option_text.append(' '.join(value.split()).casefold())
                assert len(set(option_text)) == len(OPTION_KEYS), f'{label}: choice text must be distinct'
                for field in ('hint', 'explanation'):
                    value = question.get(field)
                    assert isinstance(value, str) and value.strip(), f'{label}: {field} must be a nonempty string'


# Learner-visible prose checked for copied English (D04-06-04). Quiz text is checked too.
PROSE_FIELDS = (
    'title', 'prerequisites', 'objective', 'assistance_policy_label',
    'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion',
)
QUIZ_PROSE_FIELDS = ('prompt', 'hint', 'explanation')
# Minimum share of CJK characters among letters (CJK + Latin) after stripping code.
# Observed minimum on current Days 04-06 content is about 0.18; English text is 0.0
# and "English with a Japanese/Chinese prefix" is well below 0.10.
MIN_CJK_SHARE = 0.10
# A quiz option may stay byte-identical to English only when it is a code literal or
# output with fewer than this many alphabetic words (e.g. "git add -A", "'0' str True").
MIN_PROSE_WORDS = 3
_NON_PROSE = (
    re.compile(r'```[\s\S]*?```'),  # fenced code / output
    re.compile(r'`[^`\n]*`'),  # inline code
    re.compile(r'https?://\S+'),  # URLs
    re.compile(r'(?<![\w.])(?:[\w.-]+/)*[\w-]+\.[A-Za-z]\w*(?!\w)'),  # file names / paths
    re.compile(r'(?<!\w)[A-Za-z_]\w*\([^()\n]*\)'),  # calls such as repr(value)
    re.compile(r'(?<!\w)[A-Za-z]+_\w+'),  # snake_case identifiers
    re.compile(r'\b\w+(?:\.\w+)+\b'),  # dotted identifiers
)
_CJK = re.compile(r'[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]')
_LATIN = re.compile(r'[A-Za-z]')
_WORD = re.compile(r'[A-Za-z]{2,}')


def strip_non_prose(text):
    for pattern in _NON_PROSE:
        text = pattern.sub(' ', text)
    return ' '.join(text.split())


def cjk_share(text):
    cjk, latin = len(_CJK.findall(text)), len(_LATIN.findall(text))
    return cjk / (cjk + latin) if cjk + latin else None


def localized_prose_pairs(english, edition):
    """Yield (pointer, localized, english, is_option) for learner-visible activity text."""
    for activity_id, activity in edition['activities'].items():
        source = english['activities'][activity_id]
        for field in PROSE_FIELDS:
            yield f'{activity_id}/{field}', activity[field], source[field], False
        quiz = activity.get('quiz') or {}
        source_questions = (source.get('quiz') or {}).get('questions', [])
        for index, (question, source_question) in enumerate(zip(quiz.get('questions', []), source_questions, strict=True)):
            pointer = f'{activity_id}/quiz/questions/{index}'
            for field in QUIZ_PROSE_FIELDS:
                yield f'{pointer}/{field}', question[field], source_question[field], False
            for key, value in question['options'].items():
                yield f'{pointer}/options/{key}', value, source_question['options'][key], True


def validate_localized_prose(day_id, editions):
    """Reject non-English prose that is copied English; return (min CJK share, exempt option count)."""
    english = editions[LANGS.index('en')]
    minimum, exempt = 1.0, 0
    for language, edition in zip(LANGS, editions, strict=True):
        if language == 'en':
            continue
        for pointer, text, source, is_option in localized_prose_pairs(english, edition):
            label = f'{day_id}/{language}/{pointer}'
            prose, source_prose = strip_non_prose(text), strip_non_prose(source)
            if is_option and prose == source_prose and len(_WORD.findall(source_prose)) < MIN_PROSE_WORDS:
                exempt += 1  # shared code literal / program output, not prose
                continue
            assert prose != source_prose, f'{label}: localized text equals English after stripping code'
            share = cjk_share(prose)
            assert share is not None and share >= MIN_CJK_SHARE, (
                f'{label}: CJK share {share} below {MIN_CJK_SHARE}; text looks like copied English'
            )
            minimum = min(minimum, share)
    return minimum, exempt


class StudyDays04To06Tests(unittest.TestCase):
    def test_ledgers_prerequisites_and_stable_activity_ids(self):
        for number in (4, 5, 6):
            day_id = f'day-{number:02d}'
            day = json.loads((ROOT / 'curriculum/days' / f'{day_id}.json').read_text())
            self.assertEqual(day['active_minutes'], 480)
            self.assertEqual(sum(a['active_minutes'] for a in day['activities']), 480)
            self.assertEqual([a['active_minutes'] for a in day['activities']], [120] * 4)
            self.assertEqual(day['prerequisites'], [f'day-{number - 1:02d}'])
            self.assertEqual([a['id'] for a in day['activities']], [f'{day_id}-act-{i:02d}' for i in range(1, 5)])
            self.assertTrue(any(a['activity_type'] == 'review' for a in day['activities']))
            self.assertTrue(any(a['assistance_policy'] == 'agent_assisted' for a in day['activities']))

    def test_four_editions_preserve_behavior_and_evidence_boundaries(self):
        seen_prompts = {}
        for number in (4, 5, 6):
            day_id = f'day-{number:02d}'
            descriptor = json.loads((ROOT / 'curriculum/days' / f'{day_id}.json').read_text())
            editions = [json.loads((ROOT / 'curriculum/content' / day_id / f'{lang}.json').read_text()) for lang in LANGS]
            ids = set(editions[0]['activities'])
            self.assertEqual(len(ids), 4)
            for content, lang in zip(editions, LANGS, strict=True):
                self.assertEqual(content['language'], lang)
                self.assertEqual(set(content['activities']), ids)
                for activity in content['activities'].values():
                    self.assertTrue(set(activity) >= REQUIRED)
                    for field in REQUIRED:
                        self.assertIsInstance(activity[field], str)
                        self.assertTrue(activity[field].strip(), f'{day_id}/{lang}/{field} must be nonempty')
            validate_localized_quizzes(day_id, editions, descriptor, seen_prompts)
            # Compare shared code/output fixtures as text; never execute curricular Git examples.
            for activity_id in ids:
                code_blocks = [
                    [
                        (field, re.findall(r'```([a-zA-Z0-9_-]*)\n([\s\S]*?)```', edition['activities'][activity_id][field]))
                        for field in ('instructions', 'exercise_prompt', 'answer')
                    ]
                    for edition in editions
                ]
                self.assertTrue(any(blocks for _, blocks in code_blocks[0]), f'{day_id}/{activity_id}: missing shared code/output fixtures')
                for lang, blocks in zip(LANGS[1:], code_blocks[1:], strict=True):
                    self.assertEqual(blocks, code_blocks[0], f'{day_id}/{lang}/{activity_id}: code/output differs by locale')

    def test_quiz_validator_rejects_missing_prompts_in_memory(self):
        corpus = []
        for number in (4, 5, 6):
            day_id = f'day-{number:02d}'
            descriptor = json.loads((ROOT / 'curriculum/days' / f'{day_id}.json').read_text())
            editions = [json.loads((ROOT / 'curriculum/content' / day_id / f'{lang}.json').read_text()) for lang in LANGS]
            corpus.append((day_id, descriptor, editions))
            for language_index, edition in enumerate(editions):
                for activity_id, activity in edition['activities'].items():
                    for question_index, _ in enumerate(activity['quiz']['questions']):
                        flawed = copy.deepcopy(editions)
                        question = flawed[language_index]['activities'][activity_id]['quiz']['questions'][question_index]
                        question.pop('prompt', None)
                        question.pop('question', None)
                        with (
                            self.subTest(day=day_id, language=LANGS[language_index], activity=activity_id),
                            self.assertRaisesRegex(AssertionError, 'prompt must be a nonempty string'),
                        ):
                            validate_localized_quizzes(day_id, flawed, descriptor)
        # Reproduce the historical all-48-missing defect without touching real JSON.
        all_missing = copy.deepcopy(corpus)
        removed = 0
        for _, _, editions in all_missing:
            for edition in editions:
                for activity in edition['activities'].values():
                    for question in activity['quiz']['questions']:
                        question.pop('prompt', None)
                        question.pop('question', None)
                        removed += 1
        self.assertEqual(removed, 48)
        for day_id, descriptor, editions in all_missing:
            with (
                self.subTest(all_prompts_missing=day_id),
                self.assertRaisesRegex(AssertionError, 'prompt must be a nonempty string'),
            ):
                validate_localized_quizzes(day_id, editions, descriptor)

    def test_manifest_and_review_record_are_published(self):
        manifest = json.loads((ROOT / 'curriculum/manifest.json').read_text())
        lessons = {item['id']: item for item in manifest['lessons']}
        for number in (4, 5, 6):
            self.assertEqual(lessons[f'les-{number:02d}']['status'], 'available')
        review = (ROOT / 'curriculum/reviews/study-days-04-06.md').read_text()
        for marker in ('Python Standard Library', 'Git Book', 'Day 04', 'Day 05', 'Day 06', 'four Language Editions'):
            self.assertIn(marker, review)

    def test_localized_prose_is_not_copied_english(self):
        minima = {}
        for number in (4, 5, 6):
            day_id = f'day-{number:02d}'
            editions = [json.loads((ROOT / 'curriculum/content' / day_id / f'{lang}.json').read_text()) for lang in LANGS]
            minimum, exempt = validate_localized_prose(day_id, editions)
            minima[day_id] = minimum
            self.assertGreaterEqual(minimum, MIN_CJK_SHARE)
            # Code-literal options (at most 9 per locale per day today) may stay identical to English.
            self.assertLessEqual(exempt, 3 * 9, f'{day_id}: too many options exempted as code literals')
        self.assertEqual(set(minima), {'day-04', 'day-05', 'day-06'})

    def test_localized_prose_validator_rejects_copied_english_in_memory(self):
        day_id = 'day-04'
        editions = [json.loads((ROOT / 'curriculum/content' / day_id / f'{lang}.json').read_text()) for lang in LANGS]
        ja, en = LANGS.index('ja'), LANGS.index('en')
        activity_id = next(iter(editions[en]['activities']))
        english_activity = editions[en]['activities'][activity_id]
        for field in PROSE_FIELDS:
            flawed = copy.deepcopy(editions)
            flawed[ja]['activities'][activity_id][field] = english_activity[field]
            with (
                self.subTest(copied=field),
                self.assertRaisesRegex(AssertionError, rf'{day_id}/ja/{activity_id}/{field}: localized text equals English'),
            ):
                validate_localized_prose(day_id, flawed)
        # Historical defect shape: English body behind a Japanese prefix.
        flawed = copy.deepcopy(editions)
        flawed[ja]['activities'][activity_id]['instructions'] = '必須課題：' + english_activity['instructions']
        with self.assertRaisesRegex(AssertionError, rf'{day_id}/ja/{activity_id}/instructions: CJK share'):
            validate_localized_prose(day_id, flawed)
        # Copied English quiz prose is caught as well.
        flawed = copy.deepcopy(editions)
        question = flawed[ja]['activities'][activity_id]['quiz']['questions'][0]
        question['explanation'] = english_activity['quiz']['questions'][0]['explanation']
        with self.assertRaisesRegex(AssertionError, 'quiz/questions/0/explanation: localized text equals English'):
            validate_localized_prose(day_id, flawed)


if __name__ == '__main__':
    unittest.main()
