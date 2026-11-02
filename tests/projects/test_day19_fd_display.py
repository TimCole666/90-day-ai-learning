import ast
import json
import re
import unittest
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "curriculum" / "content" / "day-19"
LOCALES = {
    "en": (r"approximately\s+(?P<value>\d+(?:\.\d+)?)", r"floating-point.*digits.*vary"),
    "ja": (r"約\s*(?P<value>\d+(?:\.\d+)?)", r"浮動小数点.*末尾.*変わる"),
    "zh-Hans": (r"约\s*(?P<value>\d+(?:\.\d+)?)", r"浮点.*末尾.*不同"),
    "zh-Hant": (r"約\s*(?P<value>\d+(?:\.\d+)?)", r"浮點.*末尾.*不同"),
}
OLD_DISPLAY_FRAGMENTS = (
    "107.99999",
    "five digits",
    "5 桁まで一致",
    "五位有效数字一致",
    "五位有效數字一致",
)


def load_activity(locale):
    with (CONTENT / f"{locale}.json").open(encoding="utf-8") as stream:
        return json.load(stream)["activities"]["day-19-act-03"]


class Day19FiniteDifferenceDisplayTests(unittest.TestCase):
    def test_reviewed_helper_is_pure_and_matches_exact_polynomial_reference(self):
        instructions = load_activity("en")["instructions"]
        match = re.search(
            r"def central_fd\(f, x, h=1e-5\): return \(f\(x \+ h\) - f\(x - h\)\) / \(2 \* h\)",
            instructions,
        )
        if match is None:
            raise AssertionError('Published helper definition missing')
        helper_tree = ast.parse(match.group(0), mode="exec")
        allowed = (
            ast.Module,
            ast.FunctionDef,
            ast.arguments,
            ast.arg,
            ast.Return,
            ast.Call,
            ast.Name,
            ast.Load,
            ast.Constant,
            ast.BinOp,
            ast.Add,
            ast.Sub,
            ast.Mult,
            ast.Div,
        )
        self.assertTrue(all(isinstance(node, allowed) for node in ast.walk(helper_tree)))
        function = helper_tree.body[0]
        if not isinstance(function, ast.FunctionDef):
            raise AssertionError('Published helper must be a function')
        self.assertEqual(function.name, "central_fd")
        self.assertEqual([arg.arg for arg in function.args.args], ["f", "x", "h"])
        default = function.args.defaults[0]
        if not isinstance(default, ast.Constant):
            raise AssertionError('Helper step default must be a literal')
        self.assertEqual(default.value, 1e-5)
        # The exact regex and AST checks bind this reviewed arithmetic to the
        # published helper without executing curriculum text.
        def polynomial(value):
            return 8 * value**6 + 12 * value**4 + 6 * value**2 + 1
        h = Fraction(1, 100000)
        exact_fd = (polynomial(Fraction(1) + h) - polynomial(Fraction(1) - h)) / (2 * h)
        step = 1e-5
        upper = (2 * (1 + step) ** 2 + 1) ** 3
        lower = (2 * (1 - step) ** 2 + 1) ** 3
        observed = (upper - lower) / (2 * step)
        # This fixture checks its displayed precision, not a universal FD tolerance.
        self.assertGreater(exact_fd, 108)
        self.assertLess(exact_fd - 108, Fraction(1, 10**7))
        self.assertEqual(format(observed, '.5g'), format(float(exact_fd), '.5g'))
        self.assertEqual(format(observed, '.5g'), '108')

    def test_all_localized_answers_use_conservative_approximately_108_display(self):
        for locale, (number_pattern, caveat_pattern) in LOCALES.items():
            with self.subTest(locale=locale):
                answer = load_activity(locale)["answer"]
                claim = re.search(number_pattern, answer)
                if claim is None:
                    raise AssertionError(f'{locale}: approximate result missing')
                self.assertEqual(float(claim.group('value')), 108.0)
                self.assertRegex(answer, caveat_pattern)
                self.assertNotIn("107.99999", answer)
                self.assertFalse(any(fragment in answer for fragment in OLD_DISPLAY_FRAGMENTS))
                self.assertIn("24.0000", answer)


if __name__ == "__main__":
    unittest.main()
