from typing import Dict, Any, List, Tuple
from .contracts import EvidenceItem

class ContextPlanner:
    """
    Constructs a strictly bounded, highly relevant context slice (Context Budget & Ranking)
    and generates deterministic Evidence IDs (EV-001, EV-002, ...).
    """

    MAX_FINDINGS = 10
    MAX_VARIANTS = 10
    MAX_TRANSITIONS = 20
    MAX_EVIDENCE = 50

    @classmethod
    def build_context_and_evidence(
        cls,
        intent: str,
        domain_context: Dict[str, Any],
        entities: Dict[str, Any] = None
    ) -> Tuple[Dict[str, Any], List[EvidenceItem]]:
        if intent == "CONVERSATION":
            return {}, []

        evidence_list: List[EvidenceItem] = []
        ev_counter = 1

        def next_ev_id():
            nonlocal ev_counter
            eid = f"EV-{ev_counter:03d}"
            ev_counter += 1
            return eid

        case_count = domain_context.get("total_cases", 0)
        median_ct = domain_context.get("median_cycle_time_hours", 0.0)
        p90_ct = domain_context.get("p90_cycle_time_hours", 0.0)
        rework_rate = domain_context.get("rework_rate_pct", 0.0)
        sla_comp = domain_context.get("sla_compliance_pct", 100.0)
        sla_hours = domain_context.get("sla_target_hours", 24.0)

        # 1. Primary Cycle Time Pill (Combined P50 & P90 for concise UI display)
        ev_median = EvidenceItem(
            id=next_ev_id(),
            metric="Median Waktu Siklus (P50)",
            value=f"{median_ct} jam (P90: {p90_ct} jam)",
            details={"median": median_ct, "p90": p90_ct, "cases": case_count}
        )
        evidence_list.append(ev_median)

        # 2. Primary Bottleneck Transition (Top 1 transition with highest delay)
        transitions = domain_context.get("top_transitions", [])
        if transitions:
            top_t = transitions[0]
            src = top_t.get("source")
            tgt = top_t.get("target")
            med_el = top_t.get("median_elapsed_hours")
            freq = top_t.get("frequency")
            ev_t = EvidenceItem(
                id=next_ev_id(),
                metric=f"Transisi '{src} → {tgt}'",
                value=f"Median: {med_el} jam, Frekuensi: {freq:,}x",
                details=top_t
            )
            evidence_list.append(ev_t)

        # 3. SLA Compliance (if violated or relevant)
        if sla_comp < 100.0 or intent in ["DIAGNOSIS", "FACT_LOOKUP"]:
            ev_sla = EvidenceItem(
                id=next_ev_id(),
                metric="Kepatuhan Batas Waktu SLA",
                value=f"{sla_comp}% (Target: {sla_hours} jam)",
                details={"sla_hours": sla_hours, "compliance_pct": sla_comp}
            )
            evidence_list.append(ev_sla)

        # 4. Rework / Variant (if intent requires)
        if intent == "VARIANT_ANALYSIS":
            variants = domain_context.get("variants", [])[:3]
            for v in variants:
                rank = v.get("rank")
                share = v.get("share_pct")
                med_v = v.get("median_cycle_hours")
                ev_v = EvidenceItem(
                    id=next_ev_id(),
                    metric=f"Varian #{rank}",
                    value=f"Pangsa: {share}%, Median: {med_v} jam",
                    details=v
                )
                evidence_list.append(ev_v)
        elif rework_rate > 0 and intent in ["DIAGNOSIS", "PROCESS_ANALYSIS"]:
            ev_rework = EvidenceItem(
                id=next_ev_id(),
                metric="Tingkat Pengerjaan Ulang",
                value=f"{rework_rate}%",
                details={"rework_rate_pct": rework_rate}
            )
            evidence_list.append(ev_rework)

        # Structured context pack for LLM prompt
        structured_context = {
            "process_name": domain_context.get("process_name", "Proses Bisnis"),
            "intent": intent,
            "evidence_package": [e.model_dump() for e in evidence_list]
        }

        return structured_context, evidence_list
