from sentinel_engine.guard.attacks import load_attack_library


def test_load_attack_library_returns_exactly_23_attacks():
    assert len(load_attack_library()) == 23


def test_all_attack_ids_are_unique():
    ids = [attack.id for attack in load_attack_library()]
    assert len(ids) == len(set(ids))


def test_all_attacks_have_a_non_empty_prompt():
    assert all(attack.prompt.strip() for attack in load_attack_library())


def test_attacks_span_the_expected_categories():
    categories = {attack.category for attack in load_attack_library()}
    assert categories == {
        "prompt_injection",
        "jailbreak_roleplay",
        "authority_impersonation",
        "obfuscation",
        "social_engineering",
    }
