import unittest

from src.greeter import greeting


class GreetingTest(unittest.TestCase):
    def test_exact_case_sensitive_greeting(self):
        # Deliberately red until the agent preserves the requested case.
        self.assertEqual(greeting("Learner"), "Hello, Learner!")


if __name__ == "__main__":
    unittest.main()
