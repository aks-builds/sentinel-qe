from sentinel._schema import validate_schema


def test_valid_object_has_no_errors():
    schema = {
        "type": "object",
        "required": ["order_id"],
        "properties": {"order_id": {"type": "string"}},
    }
    errors = validate_schema(schema, {"order_id": "12345"})
    assert errors == []


def test_missing_required_property_reported():
    schema = {"type": "object", "required": ["order_id"], "properties": {}}
    errors = validate_schema(schema, {})
    assert errors == ["root.order_id: required property missing"]


def test_wrong_type_reported():
    schema = {"type": "string"}
    errors = validate_schema(schema, 42)
    assert errors == ["root: expected type 'string', got 'integer'"]


def test_enum_violation_reported():
    schema = {"type": "string", "enum": ["open", "closed"]}
    errors = validate_schema(schema, "pending")
    assert errors == ["root: value 'pending' not in enum ['open', 'closed']"]


def test_nested_object_properties_validated():
    schema = {
        "type": "object",
        "properties": {
            "address": {
                "type": "object",
                "required": ["zip"],
                "properties": {"zip": {"type": "string"}},
            }
        },
    }
    errors = validate_schema(schema, {"address": {}})
    assert errors == ["root.address.zip: required property missing"]


def test_array_items_validated():
    schema = {"type": "array", "items": {"type": "string"}}
    errors = validate_schema(schema, ["a", 2, "c"])
    assert errors == ["root[1]: expected type 'string', got 'integer'"]


def test_no_type_constraint_always_passes():
    errors = validate_schema({}, "anything")
    assert errors == []
