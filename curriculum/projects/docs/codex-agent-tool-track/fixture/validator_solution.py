"""Reference correction for the bounded Codex exercise."""


def validate_record(data):
    """Return True for an enabled record with a non-empty name."""
    if not isinstance(data, dict):
        return False
    name = data.get("name")
    return data.get("enabled") is True and isinstance(name, str) and bool(name.strip())
