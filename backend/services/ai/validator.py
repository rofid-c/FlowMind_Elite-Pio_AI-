from typing import List, Dict, Any, Set
from .contracts import (
    AIAnswerObject, EvidenceItem, FactStatement, InterpretationStatement,
    HypothesisStatement, RecommendationStatement
)

class ResponseValidator:
    """
    Validates model output against strict Grounded Process Mining rules:
    - Verifies evidence_ids exist in the evidence package (rejects EV-999)
    - Demotes unsupported statements into labeled hypotheses
    - Sanitizes aggressive causality claims to correlation / association language
    - Enforces conservative recommendation wording
    """

    NON_CONSERVATIVE_REPLACEMENTS = {
        "harus menghapus": "evaluasi kemungkinan konsolidasi",
        "pasti menyebabkan": "berkorelasi kuat dengan",
        "menjamin penurunan": "berpotensi menurunkan",
        "pasti berhasil": "dapat diuji efektivitasnya",
        "causes": "is associated with",
        "guarantees": "may contribute to"
    }

    @classmethod
    def validate_and_sanitize(
        cls,
        raw_response: Dict[str, Any],
        evidence_list: List[EvidenceItem],
        intent: str
    ) -> AIAnswerObject:
        valid_ev_ids: Set[str] = {e.id for e in evidence_list}

        summary = raw_response.get("summary", "")
        facts_in = raw_response.get("facts", [])
        interps_in = raw_response.get("interpretations", [])
        hypos_in = raw_response.get("hypotheses", [])
        recs_in = raw_response.get("recommendations", [])
        limits_in = raw_response.get("limitations", [])
        follow_ups = raw_response.get("follow_up_questions", [])

        # Process Facts
        valid_facts: List[FactStatement] = []
        demoted_hypos: List[HypothesisStatement] = []

        for f in facts_in:
            text = f.get("text", "") if isinstance(f, dict) else str(f)
            eids = [eid for eid in (f.get("evidence_ids", []) if isinstance(f, dict) else []) if eid in valid_ev_ids]
            
            if eids:
                valid_facts.append(FactStatement(text=text, evidence_ids=eids))
            else:
                # Demote unsupported fact to hypothesis (Section 21)
                demoted_hypos.append(HypothesisStatement(
                    text=f"Hipotesis (belum terikat bukti langsung): {text}",
                    evidence_ids=[]
                ))

        # Process Interpretations
        valid_interps: List[InterpretationStatement] = []
        for inp in interps_in:
            text = inp.get("text", "") if isinstance(inp, dict) else str(inp)
            eids = [eid for eid in (inp.get("evidence_ids", []) if isinstance(inp, dict) else []) if eid in valid_ev_ids]
            valid_interps.append(InterpretationStatement(text=cls._sanitize_causality(text), evidence_ids=eids))

        # Process Hypotheses
        valid_hypos: List[HypothesisStatement] = list(demoted_hypos)
        for h in hypos_in:
            text = h.get("text", "") if isinstance(h, dict) else str(h)
            eids = [eid for eid in (h.get("evidence_ids", []) if isinstance(h, dict) else []) if eid in valid_ev_ids]
            valid_hypos.append(HypothesisStatement(text=cls._sanitize_causality(text), evidence_ids=eids))

        # Process Recommendations
        valid_recs: List[RecommendationStatement] = []
        for r in recs_in:
            text = r.get("text", "") if isinstance(r, dict) else str(r)
            act_type = r.get("action_type", "INVESTIGATE") if isinstance(r, dict) else "INVESTIGATE"
            eids = [eid for eid in (r.get("evidence_ids", []) if isinstance(r, dict) else []) if eid in valid_ev_ids]
            valid_recs.append(RecommendationStatement(
                text=cls._sanitize_conservative(text),
                action_type=act_type,
                evidence_ids=eids
            ))

        # Process Possible Causes (PRD v1)
        possible_causes_in = raw_response.get("possible_causes", [])
        possible_causes: List[str] = []
        if isinstance(possible_causes_in, list) and len(possible_causes_in) > 0:
            for pc in possible_causes_in:
                possible_causes.append(cls._sanitize_causality(str(pc.get("text", pc) if isinstance(pc, dict) else pc)))
        else:
            # Derive from hypotheses
            for h in valid_hypos:
                possible_causes.append(h.text)

        # Primary Recommendation (PRD v1)
        rec_single = raw_response.get("recommendation")
        if not rec_single and valid_recs:
            rec_single = valid_recs[0].text
        elif rec_single:
            rec_single = cls._sanitize_conservative(str(rec_single))

        # Enforce Limitations & Uncertainty (PRD v1)
        limits = [str(l.get("text", l) if isinstance(l, dict) else l) for l in (limits_in if isinstance(limits_in, list) else [])]
        if not any("timestamp" in l.lower() or "antrean" in l.lower() for l in limits):
            limits.append("Data log peristiwa mencatat timestamp status tetapi tidak merekam durasi antrean pasif eksplisit.")

        # Uncertainty (PRD v1)
        uncertainty_str = raw_response.get("uncertainty")
        if not uncertainty_str and limits:
            uncertainty_str = limits[0]
        elif uncertainty_str:
            uncertainty_str = str(uncertainty_str)

        # Evidence handling (ensure EV items are preserved)
        raw_evidence_in = raw_response.get("evidence", [])
        final_evidence = list(evidence_list)
        if isinstance(raw_evidence_in, list) and len(raw_evidence_in) > 0:
            # If model returned direct metrics list (e.g. {"metric": "...", "value": "..."})
            for idx, item in enumerate(raw_evidence_in):
                if isinstance(item, dict) and "metric" in item and "value" in item:
                    # check if already in evidence_list
                    if not any(e.metric == item["metric"] for e in final_evidence):
                        final_evidence.append(EvidenceItem(
                            id=f"EV-{len(final_evidence)+1:03d}",
                            metric=str(item["metric"]),
                            value=str(item["value"])
                        ))

        return AIAnswerObject(
            answer_type=intent,
            summary=cls._sanitize_causality(summary),
            answer=cls._sanitize_causality(summary),
            facts=valid_facts,
            evidence=final_evidence,
            interpretations=valid_interps,
            hypotheses=valid_hypos,
            possible_causes=possible_causes,
            recommendations=valid_recs,
            recommendation=rec_single,
            limitations=limits,
            uncertainty=uncertainty_str,
            follow_up_questions=follow_ups if isinstance(follow_ups, list) else [],
            prompt_version="pio-ai-v1.0",
            validation_status="VALIDATED"
        )

    @classmethod
    def _sanitize_causality(cls, text: str) -> str:
        for k, v in cls.NON_CONSERVATIVE_REPLACEMENTS.items():
            text = text.replace(k, v)
        return text

    @classmethod
    def _sanitize_conservative(cls, text: str) -> str:
        text = cls._sanitize_causality(text)
        return text
