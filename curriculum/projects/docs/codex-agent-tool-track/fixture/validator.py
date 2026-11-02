"""Starter fixture: one deliberately unsafe null-record dereference."""


def validate_record(data):
    """Return True for an enabled record with a non-empty name."""
    return data["enabled"] is True and bool(data["name"].strip())
