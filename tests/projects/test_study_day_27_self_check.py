"""Offline, stdlib-only Day27 incidental numeric-key exposure regression.

Only the four repository lesson JSON files are read. Original primary-answer
UTF-8 lengths/hashes were derived during authoring from the original snapshots;
the checker hash pins the exact approved source, excluding its docstring.
Instruction and criterion hashes lock the reviewed text in all four locales.
A separate literal invariant rejects the old primary numerical answer keys in
always-visible mastery criteria. The text hashes are fixture identity locks,
not semantic/policy certification, vocabulary or translation-quality gates.

This permanent test NEVER runs source or usage extracted from lesson JSON.
Its role is detecting drift from the exact audited snippet, previously run in
a separate private offline prototype with 105 independent checks by the parent.
Numeric cases exercise only the explicitly independent test oracle below,
against a separate arithmetic reference using log identities. They do not
dynamically test the lesson checker or prove its runtime behavior. No temporary
files, dynamic source loading, or filesystem writes are needed by this test.

Limits: this cannot enforce timing/preservation, prevent deliberate pre-execution,
prove unaided learner conduct or mastery, certify source-native language quality
or policy semantics, or establish PED-001 acceptance. Part (d)'s infinite-NLL,
positive-probability safeguard and distribution-effect rubric stays manual.
Run this file directly with python3 -I -B; no app/server/DB imports are needed.
"""

import ast
import contextlib
import copy
import hashlib
import io
import json
import math
import re
import unittest
from pathlib import Path
from typing import NoReturn, TypeAlias, cast

JSONObject: TypeAlias = dict[str, object]
Feedback: TypeAlias = dict[str, str]

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "curriculum" / "content" / "day-27"
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")
ACTIVITIES = tuple(f"day-27-act-0{i}" for i in range(1, 5))
PRIMARY_PREFIX = {
    "en": (322, "e0e5da3b371c82bb0ce21723e340d92b8ee754374c6948b85572807fcfe82381"),
    "ja": (403, "25ee79bc5f7eca69a0f8992a2cf81f320b1ded7be9841bf98087f83b1a998b72"),
    "zh-Hans": (327, "24b98311fa49c2b59b6642098bbc81ba383aa88dfc4f3ae98901c7be6dc30a99"),
    "zh-Hant": (327, "12422399c9c4e46438deefc286b31591817c4b87a68ad2321dc47d39d0a45e38"),
}
# Exact pins protect the revised pre-attempt instructions against accidentally
# reintroducing a numeric/qualitative answer. They are fixture identities, not
# a translation-quality or natural-language keyword test.
INSTRUCTIONS_SHA256 = {
    "en": "ac5751b2968ce784dae55cf3b7cd26aec8e3e698bd9d8915c3ce05b0f24e154f",
    "ja": "7055651afd66332c9b3e270a4b363972ca48f29b6c8083c82c5d20c7c8eb9231",
    "zh-Hans": "b0320f34ee4fb9d4e992987a658f0339c0cca2b6c42b472c97e2f002409c6907",
    "zh-Hant": "c98ac8622dbdabe58c32571ab94fbe5ae765275cbbadd726bd940eef47db622f",
}
# Exact criterion identity locks catch reintroduction of the old unqualified
# claims without pretending that hashing proves policy or translation quality.
CRITERION_SHA256 = {
    "en": "f1a0fc511d600da4ecfd4696351775df0c2c5324463de3755bee5ab53c09b654",
    "ja": "8c3ac01f27b494f07333197aabb86ff06a31e7e34f9ad297714336cdaf3fcee8",
    "zh-Hans": "fe560905cea8177c07e072b9113d861cbeea6303b47c0920d84654fb79b581b2",
    "zh-Hant": "8e68e5b1db801ce9d6f64262a6758bf9e113cc07d9c934f037af4aa5aba6e5b1",
}
PRIMARY_NUMERIC_KEYS = ("1.8464", "0.1536", "1.3040", "3.6840")
PRIMARY_FIXED_KEY = re.compile(
    r"(?<![\d.])(?:1\.8464|0?\.1536|1\.3040|3\.6840)(?!\d)"
)
# Verbatim legacy claim excerpts are in-memory negative fixture identities,
# not English keyword gates or automated natural-language policy grading.
LEGACY_UNQUALIFIED_CLAIMS = {
    "en": {
        "instructions": (
            "a missed idea counts as remediated only after a fresh equivalent"
            " unaided check whose answer is not shown in advance."
        ),
        "mastery_criterion": (
            "misses route to a recovery link, and each missed idea is remediated"
            " only by a fresh equivalent unaided check."
        ),
    },
    "ja": {
        "instructions": (
            "抜けた概念は、答えを事前に見せない新しい同等の無支援チェックに合格して"
            "初めて修復済みとみなす。"
        ),
        "mastery_criterion": (
            "誤りは回復リンクにつながり、抜けた概念は新しい同等の無支援チェックでのみ"
            "修復されること。"
        ),
    },
    "zh-Hans": {
        "instructions": (
            "遗漏的概念须通过一次答案事先不展示的新同等无协助检查，才算已补救。"
        ),
        "mastery_criterion": (
            "错题接入恢复链接，且每个遗漏概念须经一次新的同等无协助检查才算补救。"
        ),
    },
    "zh-Hant": {
        "instructions": (
            "遺漏的概念須通過一次答案事先不展示的新同等無協助檢查，才算已補救。"
        ),
        "mastery_criterion": (
            "錯題接入恢復連結，且每個遺漏概念須經一次新的同等無協助檢查才算補救。"
        ),
    },
}
# Exact approved import + function source, without surrounding newlines/docstring.
APPROVED_CHECKER_SHA256 = "2c471550987986d6b9c02aabd62fa2cc3c4eb3695c7453effa5facbfef7e204a"
FENCE = re.compile(r"^```([^\n`]*)\n(.*?)\n```[ \t]*(?:\n|$)", re.M | re.S)
INLINE = re.compile(r"(?<!`)`([^`\n]+)`(?!`)")
FIXED_KEY = re.compile(r"(?<![\d.])(?:1\.6815|0?\.3185|1\.2296|3\.4200)(?!\d)")
USAGE = (
    "submission = {'a': [None], 'b': [None, None], "
    "'c': [None, None, None, None, None]}\nprint(verify(submission))"
)
PARTS = ("(a)", "(b)", "(c)")
FAIL: Feedback = dict.fromkeys(PARTS, "fail")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def json_object(value: object) -> JSONObject:
    if type(value) is not dict:
        raise ValueError("expected a JSON object")
    return cast(JSONObject, value)


def text_field(data: JSONObject, field: str) -> str:
    value = data.get(field)
    if not isinstance(value, str):
        raise ValueError(f"expected a string field: {field}")
    return value


def last_activity(data: JSONObject) -> JSONObject:
    activities = json_object(data.get("activities"))
    return json_object(activities.get(ACTIVITIES[-1]))


def unique_pairs(pairs: list[tuple[str, object]]) -> JSONObject:
    result: JSONObject = {}
    for key, value in pairs:
        require(key not in result, f"duplicate JSON key: {key!r}")
        result[key] = value
    return result


def reject_constant(value: str) -> NoReturn:
    raise ValueError(f"non-JSON numeric constant: {value}")


def strict_json(text: str) -> JSONObject:
    return json_object(json.loads(text, object_pairs_hook=unique_pairs,
                                  parse_constant=reject_constant))


def inspect_lesson(data: JSONObject, locale: str) -> tuple[str, str]:
    """Reject structural/content drift without running any extracted code."""
    activities = json_object(data.get("activities"))
    require(tuple(activities) == ACTIVITIES, "activity IDs/order changed")
    act = last_activity(data)
    # These criteria are always visible; hidden-answer keys must not leak here.
    # Literal source matching is independent of the language of the prose.
    for activity in activities.values():
        criterion = text_field(json_object(activity), "mastery_criterion")
        require(not PRIMARY_FIXED_KEY.search(criterion),
                "primary numeric key exposed in always-visible criterion")
    criterion = text_field(act, "mastery_criterion")
    require(hashlib.sha256(criterion.encode("utf-8")).hexdigest()
            == CRITERION_SHA256[locale], "visible criterion fixture changed")
    instructions = text_field(act, "instructions")
    require(hashlib.sha256(instructions.encode("utf-8")).hexdigest()
            == INSTRUCTIONS_SHA256[locale], "pre-attempt instructions changed")
    answer = text_field(act, "answer")
    size, digest = PRIMARY_PREFIX[locale]
    encoded = answer.encode("utf-8")
    require(hashlib.sha256(encoded[:size]).hexdigest() == digest,
            "protected primary answer changed")
    suffix = encoded[size:].decode("utf-8")
    fences = list(FENCE.finditer(suffix))
    require(len(fences) == 1 and suffix.count("```") == 2,
            "exactly one added checker fence required")
    fence = fences[0]
    require(fence.group(1) == "python", "checker fence must be Python")
    code = fence.group(2)
    tree = ast.parse(code)
    # A stable exact-source hash is stricter than a function AST hash, and does
    # not vary with Python's addition of empty AST fields between releases.
    require(hashlib.sha256(code.encode("utf-8")).hexdigest()
            == APPROVED_CHECKER_SHA256, "unapproved checker source")
    require(len(tree.body) == 2
            and isinstance(tree.body[0], ast.Import)
            and ast.dump(tree.body[0]) == ast.dump(ast.parse("import math").body[0])
            and isinstance(tree.body[1], ast.FunctionDef)
            and tree.body[1].name == "verify", "unexpected top-level code")
    outside_code = suffix[:fence.start()] + suffix[fence.end():]
    prose = [outside_code] + [value for field, value in act.items()
                              if field != "answer" and isinstance(value, str)]
    require(not any(FIXED_KEY.search(text) for text in prose),
            "appended fixed numeric key exposed")
    # These are code snippets, not natural-language heading/keyword matches.
    usage = "\n".join(INLINE.findall(suffix[fence.end():]))
    require(ast.dump(ast.parse(usage)) == ast.dump(ast.parse(USAGE)),
            "usage must contain only eight None placeholders and one print")
    return code, usage


def independent_test_oracle(submission: object) -> Feedback:
    """Model audited checker semantics independently; never run lesson source."""
    failed = dict(FAIL)
    if type(submission) is not dict:
        return failed
    fields = cast(dict[object, object], submission)
    if (any(type(key) is not str for key in fields)
            or set(fields) != {"a", "b", "c"}):
        return failed

    p = (0.55, 0.20, 0.15, 0.10)
    q = (1 / len(p),) * len(p)
    scores = (0.25, 0.5, 0.2)
    entropy = -math.fsum(pi * math.log2(pi) for pi in p)
    cross_entropy = -math.fsum(
        pi * math.log2(qi) for pi, qi in zip(p, q, strict=True)
    )
    kl = math.fsum(pi * math.log2(pi / qi) for pi, qi in zip(p, q, strict=True))
    nll = tuple(-math.log(score) for score in scores)
    mean_nll = math.fsum(nll) / len(nll)
    targets = {"a": (entropy,), "b": (cross_entropy, kl),
               "c": nll + (mean_nll, math.exp(mean_nll))}

    def matches(values: object, expected: tuple[float, ...]) -> bool:
        if type(values) not in (list, tuple):
            return False
        vector = cast(list[object] | tuple[object, ...], values)
        if len(vector) != len(expected):
            return False
        for value, target in zip(vector, expected, strict=True):
            if type(value) not in (int, float):
                return False
            number = cast(int | float, value)
            try:
                if (not math.isfinite(number) or number < 0
                        or abs(number - target) > 0.00005):
                    return False
            except OverflowError:
                return False
        return True

    return {f"({part})": "pass" if matches(fields[part], targets[part])
            else "fail" for part in ("a", "b", "c")}


def reference() -> dict[str, list[float]]:
    probabilities = (11 / 20, 1 / 5, 3 / 20, 1 / 10)
    entropy = -sum(p * math.log(p) / math.log(2) for p in probabilities)
    return {"a": [entropy], "b": [2, 2 - entropy],
            "c": [math.log(4), math.log(2), math.log(5),
                  math.log(40) / 3, 40 ** (1 / 3)]}


class PlainListSubclass(list[object]):
    pass


class PlainTupleSubclass(tuple[object, ...]):
    pass


class PlainDictSubclass(dict[str, object]):
    pass


class PlainStrSubclass(str):
    pass


class Day27SelfCheckTests(unittest.TestCase):
    lessons: dict[str, JSONObject]

    @classmethod
    def setUpClass(cls) -> None:
        cls.lessons = {locale: strict_json(
            (CONTENT / f"{locale}.json").read_text(encoding="utf-8"))
            for locale in LOCALES}
        for locale, data in cls.lessons.items():
            inspect_lesson(data, locale)

    def assert_oracle_feedback(self, submission: object, failed: str = "") -> None:
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = independent_test_oracle(submission)
        self.assertEqual(output.getvalue(), "")
        self.assertIs(type(result), dict)
        self.assertEqual(tuple(result), PARTS)
        self.assertTrue(all(type(value) is str for value in result.values()))
        self.assertEqual(result, {part: "fail" if part[1] in failed else "pass"
                                  for part in PARTS})

    def test_strict_json_rejects_duplicate_keys_and_nonfinite_constants(self):
        cases = ('{"x":1,"x":2}', '{"outer":{"x":1,"x":2}}',
                 '{"a":1,"\\u0061":2}', '{"x":NaN}',
                 '{"x":Infinity}', '{"x":-Infinity}')
        for text in cases:
            with self.subTest(text=text), self.assertRaises(ValueError):
                strict_json(text)

    def test_all_locales_preserve_primary_answers_and_identical_checker(self):
        expected = inspect_lesson(self.lessons["en"], "en")
        for locale, data in self.lessons.items():
            with self.subTest(locale=locale):
                self.assertEqual(inspect_lesson(data, locale), expected)

    def test_always_visible_criteria_reject_primary_answer_keys(self):
        for locale, original in self.lessons.items():
            for activity_id in ACTIVITIES:
                activity = json_object(json_object(original["activities"])[activity_id])
                criterion = text_field(activity, "mastery_criterion")
                with self.subTest(locale=locale, activity=activity_id, original=True):
                    self.assertIsNone(PRIMARY_FIXED_KEY.search(criterion))
                for number in PRIMARY_NUMERIC_KEYS + (".1536",):
                    changed = copy.deepcopy(original)
                    mutated = json_object(
                        json_object(changed["activities"])[activity_id]
                    )
                    mutated["mastery_criterion"] = criterion + " " + number
                    with (self.subTest(locale=locale, activity=activity_id, key=number),
                          self.assertRaisesRegex(
                              ValueError,
                              "primary numeric key exposed in always-visible criterion")):
                        inspect_lesson(changed, locale)

    def test_legacy_unqualified_claims_rejected_in_memory(self):
        # Appending the exact old claim must break the reviewed text identity,
        # even with the new wording and all other structure still present.
        # This does not attempt to judge the meaning of a translated sentence.
        for locale, original in self.lessons.items():
            for field, old_claim in LEGACY_UNQUALIFIED_CLAIMS[locale].items():
                changed = copy.deepcopy(original)
                act = last_activity(changed)
                act[field] = text_field(act, field) + " " + old_claim
                message = ("pre-attempt instructions changed"
                           if field == "instructions"
                           else "visible criterion fixture changed")
                with (self.subTest(locale=locale, field=field),
                      self.assertRaisesRegex(ValueError, message)):
                    inspect_lesson(changed, locale)

    def test_independent_oracle_none_placeholders_print_only_fail_indicators(self):
        for locale in LOCALES:
            with self.subTest(locale=locale):
                submission = {"a": [None], "b": [None] * 2, "c": [None] * 5}
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    print(independent_test_oracle(submission))
                self.assertEqual(output.getvalue(), repr(FAIL) + "\n")
                self.assert_oracle_feedback(submission, "abc")

    def test_independent_oracle_exact_and_four_decimal_submissions_pass(self):
        for locale in LOCALES:
            for rounded in (False, True):
                for vector_type in (list, tuple):
                    with self.subTest(locale=locale, rounded=rounded,
                                      vector=vector_type.__name__):
                        values = {key: vector_type(float(f"{x:.4f}") if rounded
                                                  else x for x in items)
                                  for key, items in reference().items()}
                        self.assert_oracle_feedback(values)

    def test_independent_oracle_each_wrong_number_fails_only_its_part(self):
        for locale in LOCALES:
            for part, items in reference().items():
                for index in range(len(items)):
                    with self.subTest(locale=locale, part=part, index=index):
                        values = reference()
                        values[part][index] += 0.01
                        self.assert_oracle_feedback(values, part)

    def test_independent_oracle_absolute_tolerance_either_side_of_half_unit(self):
        for locale in LOCALES:
            for part, items in reference().items():
                for index in range(len(items)):
                    for delta, failed in ((0.000049, ""), (0.000051, part)):
                        with self.subTest(locale=locale, part=part,
                                          index=index, delta=delta):
                            values = reference()
                            values[part][index] += delta
                            self.assert_oracle_feedback(values, failed)

    def test_independent_oracle_rejects_invalid_numbers_at_every_position(self):
        invalid: dict[str, object] = {
            "true": True, "false": False, "string": "1.0", "none": None,
            "nan": math.nan, "positive_inf": math.inf,
            "negative_inf": -math.inf, "negative_int": -1,
            "negative_float": -0.01, "overflowing_int": 10 ** 1000,
        }
        for locale in LOCALES:
            for part, items in reference().items():
                for index in range(len(items)):
                    for label, value in invalid.items():
                        with self.subTest(locale=locale, part=part,
                                          index=index, invalid=label):
                            values: dict[str, list[object]] = {
                                key: list(vector) for key, vector in reference().items()
                            }
                            values[part][index] = value
                            self.assert_oracle_feedback(values, part)

    def test_independent_oracle_rejects_wrong_vector_types_and_dimensions(self):
        for locale in LOCALES:
            for part, items in reference().items():
                invalid = {"short": items[:-1], "long": items + [0],
                           "scalar": items[0], "text": str(items), "mapping": {},
                           "none": None, "nested": [items],
                           "list_subclass": PlainListSubclass(items),
                           "tuple_subclass": PlainTupleSubclass(items)}
                for label, vector in invalid.items():
                    with self.subTest(locale=locale, part=part, invalid=label):
                        values: dict[str, object] = dict(reference())
                        values[part] = vector
                        self.assert_oracle_feedback(values, part)

    def test_independent_oracle_rejects_missing_extra_or_nonplain_submission_keys(self):
        good = reference()
        invalid: dict[str, object] = {
            f"missing_{part}": {k: v for k, v in good.items() if k != part}
            for part in good
        }
        invalid.update({"extra_d": dict(good, d=[]),
                        "extra_overall": dict(good, overall=True),
                        "numeric_key": {0: good["a"], "b": good["b"], "c": good["c"]},
                        "str_subclass_key": {PlainStrSubclass("a"): good["a"],
                                             "b": good["b"], "c": good["c"]},
                        "empty": {}, "none": None, "bool": False, "list": [],
                        "tuple": (), "text": "abc",
                        "dict_subclass": PlainDictSubclass(good)})
        for locale in LOCALES:
            for label, submission in invalid.items():
                with self.subTest(locale=locale, invalid=label):
                    self.assert_oracle_feedback(submission, "abc")

    def test_in_memory_content_negative_controls(self):
        for locale, original in self.lessons.items():
            act = last_activity(original)
            answer = text_field(act, "answer")
            size = PRIMARY_PREFIX[locale][0]
            suffix = answer.encode("utf-8")[size:].decode("utf-8")
            fence = FENCE.search(suffix)
            if fence is None:
                self.fail("approved checker fence missing from fixture")
            cases = [("missing_checker", "answer", answer.replace(fence[0], "")),
                     ("primary_changed", "answer", "X" + answer[1:]),
                     ("duplicate_checker", "answer", answer + "\n" + fence[0]),
                     ("instructions_hash_changed", "instructions",
                      "arbitrary replacement with no fixed numeric key"),
                     ("pre_attempt_d_answer_reintroduced", "instructions",
                      text_field(act, "instructions")
                      + " (d) One observed zero makes mean NLL infinite;"
                      + " assign positive probability, changing the scoring distribution.")]
            for number in ("1.6815", ".3185", "1.2296", "3.4200"):
                for field in ("answer", "instructions"):
                    cases.append((f"fixed_{field}_{number}", field,
                                  text_field(act, field) + "\n" + number))
            for label, field, value in cases:
                changed = copy.deepcopy(original)
                last_activity(changed)[field] = value
                message = ("pre-attempt instructions changed" if field == "instructions"
                           else ".*")
                with (self.subTest(locale=locale, mutation=label),
                      self.assertRaisesRegex(ValueError, message)):
                    inspect_lesson(changed, locale)
            changed = copy.deepcopy(original)
            del json_object(changed["activities"])[ACTIVITIES[0]]
            with (self.subTest(locale=locale, mutation="missing_activity"),
                  self.assertRaises(ValueError)):
                inspect_lesson(changed, locale)

    def test_unapproved_source_and_usage_rejected_by_static_inspection(self):
        for locale, original in self.lessons.items():
            answer = text_field(last_activity(original), "answer")
            code, _usage = inspect_lesson(original, locale)
            mutations = {
                "unexpected_import": answer.replace("import math", "import os"),
                "top_level_effect": answer.replace(code, code + "\nprint('UNEXPECTED')"),
                "changed_math": answer.replace("0.55", "0.56"),
                "default_effect": answer.replace("def verify(submission):",
                                                 "def verify(submission=print('UNEXPECTED')):"),
                "numeric_placeholder": answer.replace("[None]", "[0]", 1),
                "wrong_dimensions": answer.replace("[None,None]", "[None]", 1),
                "extra_key": answer.replace("'a':[None]", "'d':[], 'a':[None]"),
                "wrong_print": answer.replace("print(verify(submission))", "print(submission)"),
                "extra_usage_effect": answer.replace("print(verify(submission))",
                                                      "print(verify(submission)); print('UNEXPECTED')"),
            }
            for label, value in mutations.items():
                changed = copy.deepcopy(original)
                last_activity(changed)["answer"] = value
                output = io.StringIO()
                with self.subTest(locale=locale, mutation=label):
                    with (contextlib.redirect_stdout(output),
                          self.assertRaises(ValueError)):
                        inspect_lesson(changed, locale)
                    self.assertEqual(output.getvalue(), "")


class CountingResult(unittest.TextTestResult):
    subcases = 0

    def addSubTest(self, test, subtest, err):
        self.subcases += 1
        super().addSubTest(test, subtest, err)


class CountingRunner(unittest.TextTestRunner):
    def _makeResult(self) -> CountingResult:
        return CountingResult(self.stream, self.descriptions, self.verbosity)

    def run(self, test) -> CountingResult:
        result = super().run(test)
        if not isinstance(result, CountingResult):
            raise TypeError("expected the counting test result")
        self.stream.writeln(f"Subcases: {result.subcases}")
        self.stream.writeln(
            "Scope: pinned lesson source/usage are inspected only; numeric cases"
            " exercise the independent test oracle, not lesson code."
            " No learner/translation/mastery/PED-001 certification."
        )
        return result


if __name__ == "__main__":
    unittest.main(verbosity=2, testRunner=CountingRunner)
