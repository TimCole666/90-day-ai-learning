"""Real-mode prompt masking must cover tokenizer-added prefix tokens.

tokenize_instruction_records encodes the full example with
add_special_tokens=True. Tokenizers such as Mistral's (add_bos_token=true in
its public tokenizer_config.json) then prepend BOS, so a mask sized from the
prompt alone stops one token early and the last prompt token is trained as a
response label. A fake character tokenizer reproduces this without
Transformers or downloads.
"""

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    import torch  # noqa: F401  (projects.lora.real imports torch)
except ImportError:  # pragma: no cover
    torch = None

BOS, EOS = 1, 2


class FakeTokenizer:
    """Character ids; optional BOS/EOS added only with add_special_tokens."""

    def __init__(self, bos=False, eos=False):
        self.bos, self.eos = bos, eos
        self.all_special_ids = [BOS, EOS]

    def __call__(self, text, add_special_tokens=True, truncation=False,
                 max_length=None, return_attention_mask=False):
        ids = [ord(ch) + 10 for ch in text]
        if add_special_tokens:
            ids = ([BOS] if self.bos else []) + ids + ([EOS] if self.eos else [])
        if truncation and max_length is not None:
            ids = ids[:max_length]
        out = {"input_ids": ids}
        if return_attention_mask:
            out["attention_mask"] = [1] * len(ids)
        return out


@unittest.skipIf(torch is None, "torch not installed")
class LoraBosPromptMaskTests(unittest.TestCase):
    RECORD = {"instruction": "Add 2 and 3.", "response": "5"}

    def rows(self, tokenizer):
        from projects.lora.real import format_instruction, tokenize_instruction_records

        prompt, _ = format_instruction(self.RECORD["instruction"], self.RECORD["response"])
        (row,) = tokenize_instruction_records([self.RECORD], tokenizer, max_length=256)
        return prompt, row

    def trained(self, row):
        return [tok for tok, lab in zip(row["input_ids"], row["labels"]) if lab != -100]

    def test_plain_tokenizer_trains_only_response(self):
        prompt, row = self.rows(FakeTokenizer())
        self.assertEqual(row["labels"][: len(prompt)], [-100] * len(prompt))
        self.assertEqual(self.trained(row), [ord("5") + 10])

    def test_bos_tokenizer_masks_bos_and_whole_prompt(self):
        prompt, row = self.rows(FakeTokenizer(bos=True))
        self.assertEqual(row["input_ids"][0], BOS)
        self.assertEqual(row["labels"][: 1 + len(prompt)], [-100] * (1 + len(prompt)))
        self.assertEqual(self.trained(row), [ord("5") + 10])

    def test_bos_eos_tokenizer_trains_response_and_eos(self):
        prompt, row = self.rows(FakeTokenizer(bos=True, eos=True))
        self.assertEqual(self.trained(row), [ord("5") + 10, EOS])


if __name__ == "__main__":
    unittest.main()
