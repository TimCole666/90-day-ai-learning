import unittest

from validator import validate_record


class ValidateRecordTests(unittest.TestCase):
    def test_none_is_invalid(self):
        self.assertFalse(validate_record(None))

    def test_named_record_is_valid(self):
        self.assertTrue(validate_record({"name": "Ada"}))

    def test_missing_name_is_invalid(self):
        self.assertFalse(validate_record({"email": "ada@example.test"}))


if __name__ == "__main__":
    unittest.main()
