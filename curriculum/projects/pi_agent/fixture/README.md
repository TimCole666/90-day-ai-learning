# Pi Agent disposable-project fixture

This fixture is intentionally small. Do not run an agent in a valuable checkout.

Run the baseline from the fixture directory with:

```sh
cd curriculum/projects/pi_agent/fixture
python3 -m unittest discover -s tests
```

The exercise is to inspect the diff, correct `validate_record`, and independently verify the exit code. `run-record.json` must contain only sanitized metadata.
