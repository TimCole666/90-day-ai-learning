def validate_record(data):
    return data is not None and isinstance(data, dict) and bool(data.get("name"))
