import unittest

from validator import validate_record


class ValidateRecordTests(unittest.TestCase):
    def test_missing_record_is_invalid(self):
        self.assertFalse(validate_record(None))

    def test_missing_name_is_invalid(self):
        self.assertFalse(validate_record({"enabled": True}))

    def test_enabled_named_record_is_valid(self):
        self.assertTrue(validate_record({"enabled": True, "name": "alpha"}))

    def test_disabled_record_is_invalid(self):
        self.assertFalse(validate_record({"enabled": False, "name": "alpha"}))


if __name__ == "__main__":
    unittest.main()
