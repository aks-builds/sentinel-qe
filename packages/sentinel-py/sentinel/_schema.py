from typing import Any, List


def validate_schema(schema: dict, value: Any, path: str = "root") -> List[str]:
    """Validate `value` against a minimal JSON Schema subset.

    Supports: type, required, properties, items, enum. Returns a list of
    human-readable error strings; an empty list means the value is valid.
    """
    errors: List[str] = []

    expected_type = schema.get("type")
    if expected_type is not None and not _matches_type(value, expected_type):
        errors.append(f"{path}: expected type '{expected_type}', got '{_type_name(value)}'")
        return errors

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: value {value!r} not in enum {schema['enum']!r}")

    if expected_type == "object" and isinstance(value, dict):
        for required_key in schema.get("required", []):
            if required_key not in value:
                errors.append(f"{path}.{required_key}: required property missing")

        for key, sub_schema in schema.get("properties", {}).items():
            if key in value:
                errors.extend(validate_schema(sub_schema, value[key], f"{path}.{key}"))

    if expected_type == "array" and isinstance(value, list) and "items" in schema:
        for index, item in enumerate(value):
            errors.extend(validate_schema(schema["items"], item, f"{path}[{index}]"))

    return errors


_TYPE_CHECKS = {
    "string": lambda v: isinstance(v, str),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "null": lambda v: v is None,
}


def _matches_type(value: Any, expected_type: str) -> bool:
    check = _TYPE_CHECKS.get(expected_type)
    return check(value) if check else True


def _type_name(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__
