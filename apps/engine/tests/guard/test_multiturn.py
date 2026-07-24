from sentinel_engine.guard.multiturn import load_multiturn_attack_library


def test_load_multiturn_attack_library_returns_six_attacks():
    assert len(load_multiturn_attack_library()) == 6


def test_all_multiturn_attack_ids_are_unique():
    ids = [attack.id for attack in load_multiturn_attack_library()]
    assert len(ids) == len(set(ids))


def test_every_attack_has_at_least_two_turns():
    assert all(len(attack.turns) >= 2 for attack in load_multiturn_attack_library())


def test_attacks_span_the_three_named_techniques():
    techniques = {attack.technique for attack in load_multiturn_attack_library()}
    assert techniques == {"tree_jailbreaking", "crescendo", "sequential_jailbreak"}


def test_each_technique_has_at_least_one_attack():
    attacks = load_multiturn_attack_library()
    for technique in ("tree_jailbreaking", "crescendo", "sequential_jailbreak"):
        assert any(attack.technique == technique for attack in attacks)
