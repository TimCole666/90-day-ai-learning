"""Ticket 62: Days 53-69 Language Editions agree on values, code and steps (decided 2026-11-01, D4.5)."""
import json
import math
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ("en", "ja", "zh-Hans", "zh-Hant")

# Reference code answers that must be byte-identical in every Language Edition.
SHARED_CODE_ANSWERS = [
    ("57", "01"), ("57", "04"), ("58", "03"), ("58", "04"), ("59", "01"),
    ("60", "01"), ("60", "03"), ("60", "04"), ("64", "02"), ("64", "04"),
    ("65", "01"), ("65", "03"), ("65", "04"), ("66", "01"), ("66", "02"),
    ("66", "04"), ("67", "01"), ("67", "02"), ("67", "03"), ("68", "04"),
    ("69", "01"), ("69", "02"), ("69", "03"),
]

# (day, act, field, substring that every locale must contain)
REQUIRED = [
    ("53", "03", "instructions", "(C)"),
    ("56", "01", "instructions", "INT4"),
    ("56", "01", "instructions", "350M"),
    ("56", "01", "instructions", "sum(p.numel())"),
    ("56", "01", "answer", "2 * 768 = 1536"),
    ("57", "01", "hint", "reverse=True"),
    ("57", "01", "hint", ".sha256"),
    ("58", "03", "instructions", "dtype=torch.bfloat16"),
    ("58", "04", "instructions", "(0, 20.0]"),
    ("60", "01", "exercise_prompt", "L_val < 4.0"),
    ("64", "02", "instructions", "O(b * s * r * (d + k))"),
    ("64", "02", "exercise_prompt", "torch.equal"),
    ("64", "03", "instructions", "39,976,960"),
    ("64", "03", "instructions", "NF4"),
    ("64", "03", "instructions", "double quantization"),
    ("64", "03", "answer", "256.0 KiB"),
    ("64", "04", "hint", "self.lora_B.sum()"),
    ("65", "01", "exercise_prompt", "model.linear.weight.grad"),
    ("65", "02", "instructions", "99.4%"),
    ("65", "02", "answer", "14.90 GiB"),
    ("65", "02", "answer", "152.59 MiB"),
    ("65", "03", "instructions", "4.8"),
    ("65", "03", "hint", "rank * (in_features + out_features)"),
    ("66", "02", "instructions", "Adapter_Legal"),
    ("66", "04", "instructions", "1e-5"),
    ("67", "02", "instructions", "max_new_tokens=256"),
    ("67", "03", "instructions", "$0.60"),
    ("68", "02", "exercise_prompt", "100 * (i + 1)"),
    ("68", "02", "answer", "700"),
    ("69", "01", "instructions", "max_new_tokens=256"),
    ("69", "01", "exercise_prompt", "delta_acc > 0.30"),
    ("69", "02", "hint", "over_refusal"),
    ("69", "03", "instructions", "$0.05"),
    ("69", "03", "hint", "teardown_status == 'COMPLETED'"),
]

# (day, act, field, substring that no locale may contain)
FORBIDDEN = [
    ("64", "03", "instructions", "33.5M"),
    ("64", "03", "instructions", "~67 MB"),
    ("65", "02", "instructions", "33.5"),
    ("65", "02", "answer", "14.90 GB"),
    ("65", "03", "instructions", "3.5"),
    ("64", "04", "hint", "lora_B.weight"),
    ("65", "01", "exercise_prompt", "base_layer"),
    ("65", "04", "instructions", "base_layer"),
    ("69", "03", "exercise_prompt", "DESTROYED"),
]


def activity(day, act, locale):
    data = json.loads((ROOT / f"curriculum/content/day-{day}/{locale}.json").read_text(encoding="utf-8"))
    return data["activities"][f"day-{day}-act-{act}"]


class Ticket62ReconciliationTest(unittest.TestCase):
    def test_shared_code_answers_identical(self):
        for day, act in SHARED_CODE_ANSWERS:
            english = activity(day, act, "en")["answer"]
            for locale in LOCALES[1:]:
                self.assertEqual(activity(day, act, locale)["answer"], english, f"{day}-{act} {locale}")

    def test_required_values_present_in_every_locale(self):
        for day, act, field, needle in REQUIRED:
            for locale in LOCALES:
                self.assertIn(needle, activity(day, act, locale)[field], f"{day}-{act} {field} {locale}")

    def test_stale_values_removed(self):
        for day, act, field, needle in FORBIDDEN:
            for locale in LOCALES:
                self.assertNotIn(needle, activity(day, act, locale)[field], f"{day}-{act} {field} {locale}")

    def test_lora_parameter_arithmetic(self):
        r, d, mlp, layers = 16, 4096, 11008, 32
        all_linear = layers * (4 * r * (d + d) + 3 * r * (d + mlp))
        qv_only = layers * 2 * r * (d + d)
        self.assertEqual(all_linear, 39_976_960)
        self.assertEqual(qv_only, 8_388_608)
        self.assertEqual(round(all_linear / qv_only, 1), 4.8)
        self.assertEqual(round(100 * (1 - all_linear * 16 / 112e9), 1), 99.4)

    def test_watchdog_reference_on_day68_curve(self):
        namespace = {}
        exec(activity("68", "04", "en")["answer"], namespace)
        dog = namespace["FinetuneWatchdog"](patience=3, delta_threshold=0.005)
        losses = [2.8, 2.3, 1.9, 1.6, 1.45, 1.44, 1.48, 1.55, 1.63]
        signals = [dog.update(100 * (i + 1), loss) for i, loss in enumerate(losses)]
        self.assertEqual(signals[-1], "EARLY_STOP_SIGNAL")
        self.assertTrue(all(s is None for s in signals[:-1]))
        self.assertEqual(dog.best_step, 600)
        self.assertEqual(namespace["FinetuneWatchdog"]().update(100, math.nan), "CRITICAL_ABORT")


class Ticket62LoRAReferenceTest(unittest.TestCase):
    def setUp(self):
        try:
            import torch  # noqa: F401
        except ImportError:
            raise unittest.SkipTest("PyTorch is not installed in the current environment; use .venv/bin/python.")

    def test_lora_linear_identity_merge_and_unmerge(self):
        import torch
        namespace = {}
        exec(activity("64", "04", "en")["answer"], namespace)
        cls = namespace["LoRALinear"]
        for method in (("66", "01"), ("66", "02")):
            exec(activity(*method, "en")["answer"], namespace)
        cls.merge = namespace["merge"]
        cls.unmerge = namespace["unmerge"]
        torch.manual_seed(0)
        layer = cls(16, 8, r=4, lora_alpha=8)
        x = torch.randn(5, 16)
        self.assertTrue(torch.equal(layer(x), layer.linear(x)))
        self.assertEqual({n for n, p in layer.named_parameters() if p.requires_grad}, {"lora_A", "lora_B"})
        with torch.no_grad():
            layer.lora_B.normal_()
        w0 = layer.linear.weight.detach().clone()
        y_unmerged = layer(x)
        layer.merge()
        self.assertLess((layer(x) - y_unmerged).abs().max().item(), 1e-5)
        layer.unmerge()
        self.assertTrue(torch.allclose(layer.linear.weight, w0, atol=1e-6))

    def test_lora_forward_identity_at_init(self):
        import torch
        namespace = {"torch": torch}
        exec(activity("64", "02", "en")["answer"], namespace)
        x, w0, a = torch.randn(3, 6), torch.randn(4, 6), torch.randn(2, 6)
        b = torch.zeros(4, 2)
        self.assertTrue(torch.equal(namespace["lora_forward"](x, w0, a, b, 16, 2), x @ w0.T))


if __name__ == "__main__":
    unittest.main()
