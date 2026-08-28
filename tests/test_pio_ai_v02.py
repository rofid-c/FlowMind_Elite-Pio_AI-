import pytest
from backend.services.ai import (
    IntentRouter, ContextPlanner, ResponseValidator, EvidenceItem, AIAnswerObject
)

def test_intent_router_7_intents():
    """Verifies intent classification across core answer types including CONVERSATION."""
    # 0. CONVERSATION
    r0 = IntentRouter.route_question("hai")
    assert r0["intent"] == "CONVERSATION"

    # 1. FACT_LOOKUP
    r1 = IntentRouter.route_question("Berapa median cycle time proses ini?")
    assert r1["intent"] == "FACT_LOOKUP"

    # 2. SCENARIO
    r2 = IntentRouter.route_question("Kalau approval dikurangi 30%, apa dampaknya?")
    assert r2["intent"] == "SCENARIO"
    assert r2["entities"].get("percentage") == 30.0

    # 3. VARIANT_ANALYSIS
    r3 = IntentRouter.route_question("Varian mana yang paling lambat?")
    assert r3["intent"] == "VARIANT_ANALYSIS"

    # 4. COMPARISON
    r4 = IntentRouter.route_question("Department mana yang paling lambat performanya?")
    assert r4["intent"] == "COMPARISON"

    # 5. RECOMMENDATION
    r5 = IntentRouter.route_question("Apa yang sebaiknya dilakukan untuk perbaikan?")
    assert r5["intent"] == "RECOMMENDATION"

    # 6. PROCESS_ANALYSIS
    r6 = IntentRouter.route_question("Bagaimana alur proses ini berjalan?")
    assert r6["intent"] == "PROCESS_ANALYSIS"

    # 7. DIAGNOSIS
    r7 = IntentRouter.route_question("Kenapa proses ini lambat?")
    assert r7["intent"] == "DIAGNOSIS"

def test_context_planner_evidence_budget():
    """Verifies ContextPlanner generates EV-xxx IDs within budget limits."""
    domain_ctx = {
        "process_name": "Customer Complaint Resolution",
        "total_cases": 5000,
        "median_cycle_time_hours": 11.2,
        "p90_cycle_time_hours": 24.5,
        "rework_rate_pct": 14.2,
        "sla_compliance_pct": 82.5,
        "sla_target_hours": 24.0,
        "top_transitions": [
            {"source": "Review", "target": "Approval", "median_elapsed_hours": 5.8, "p90_elapsed_hours": 18.4, "frequency": 4200}
        ],
        "variants": [
            {"rank": 1, "variant": "Submit -> Review -> Approval -> Complete", "cases": 3500, "share_pct": 70.0, "median_cycle_hours": 8.5}
        ],
        "findings": [
            {"title": "Bottleneck Review -> Approval", "type": "BOTTLENECK", "severity": "HIGH", "what_observed": "Delay 5.8h"}
        ]
    }

    # CONVERSATION returns empty evidence
    conv_pack, conv_ev = ContextPlanner.build_context_and_evidence("CONVERSATION", domain_ctx)
    assert len(conv_ev) == 0

    # DIAGNOSIS returns focused evidence list
    pack, evidence_list = ContextPlanner.build_context_and_evidence("DIAGNOSIS", domain_ctx)
    assert len(evidence_list) >= 2
    assert evidence_list[0].id == "EV-001"
    assert evidence_list[1].id == "EV-002"
    assert any("Median Waktu Siklus" in e.metric for e in evidence_list)

def test_response_validator_unsupported_claim_demotion():
    """Verifies that unevidenced claims are automatically demoted to hypotheses."""
    evidence_list = [
        EvidenceItem(id="EV-001", metric="Total Kasus", value="5000"),
        EvidenceItem(id="EV-002", metric="Median Waktu Siklus", value="11.2 jam")
    ]

    raw_response = {
        "summary": "Analisis proses komplain.",
        "facts": [
            {"text": "Median durasi adalah 11.2 jam.", "evidence_ids": ["EV-002"]},
            {"text": "Supervisor kekurangan 5 orang staf.", "evidence_ids": ["EV-999"]}  # EV-999 does not exist!
        ],
        "interpretations": [
            {"text": "Waktu siklus melebihi ekspektasi standar.", "evidence_ids": ["EV-002"]}
        ],
        "hypotheses": [],
        "recommendations": [
            {"text": "Evaluasi kapasitas reviewer.", "action_type": "EVALUATE", "evidence_ids": ["EV-002"]}
        ],
        "limitations": []
    }

    validated: AIAnswerObject = ResponseValidator.validate_and_sanitize(raw_response, evidence_list, "DIAGNOSIS")
    
    # Valid fact with EV-002 is kept
    assert len(validated.facts) == 1
    assert validated.facts[0].evidence_ids == ["EV-002"]

    # Unsupported claim with EV-999 is demoted into hypotheses (Section 21)
    assert len(validated.hypotheses) == 1
    assert "Supervisor kekurangan" in validated.hypotheses[0].text
    assert validated.hypotheses[0].evidence_ids == []
