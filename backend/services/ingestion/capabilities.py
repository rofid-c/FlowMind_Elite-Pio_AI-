from typing import Dict, Any

class CapabilityDetector:
    """
    Evaluates dataset compatibility level (0 to 3) and generates dynamic Capability Matrix.
    Allows graceful partial capabilities (e.g. Process Discovery works even when Actor is missing).
    """

    @staticmethod
    def detect_capabilities(mapping: Dict[str, Any], format_type: str = "EVENT_LOG") -> Dict[str, Any]:
        has_case = bool(mapping.get("case_id"))
        has_act = bool(mapping.get("activity"))
        has_time = bool(mapping.get("timestamp"))
        has_actor = bool(mapping.get("actor"))
        has_dept = bool(mapping.get("department"))

        # Check Level 0
        if not (has_case and has_act and has_time) or format_type == "TRANSACTION_TABLE":
            return {
                "compatibility_level": 0,
                "compatibility_level_label": "Level 0 — Unsupported",
                "compatibility_score": 0.0,
                "is_process_discoverable": False,
                "capabilities": {
                    "process_discovery": False,
                    "cycle_time": False,
                    "transition_analysis": False,
                    "variant_analysis": False,
                    "rework_detection": False,
                    "sla_analysis": False,
                    "actor_analysis": False,
                    "department_analysis": False,
                    "cost_analysis": False,
                    "capacity_simulation": False
                },
                "supported": [],
                "limited": [],
                "unavailable": [
                    {"feature": "Process Discovery", "reason": "Requires case identifier, activity, and timestamp sequence"},
                    {"feature": "Transition Analysis", "reason": "Requires sequential event timestamps"},
                    {"feature": "Variant Analysis", "reason": "Requires end-to-end activity traces"}
                ]
            }

        # Level 1 or 2
        level = 2 if (has_actor or has_dept) else 1
        level_label = "Level 2 — Enriched" if level == 2 else "Level 1 — Basic"
        score = 92.0 if level == 2 else 80.0

        capabilities = {
            "process_discovery": True,
            "cycle_time": True,
            "transition_analysis": True,
            "variant_analysis": True,
            "rework_detection": True,
            "sla_analysis": True,
            "actor_analysis": has_actor,
            "department_analysis": has_dept,
            "cost_analysis": False,
            "capacity_simulation": False
        }

        supported = [
            "Process Discovery (DFG Model)",
            "Cycle Time & Duration Percentiles",
            "Transition Bottleneck Detection",
            "Variant & Path Deviation Explorer",
            "Rework & Loopback Detection",
            "SLA Target Compliance"
        ]

        limited = []
        unavailable = []

        if has_actor:
            supported.append("Resource & Actor Execution Analysis")
        else:
            limited.append({"feature": "Resource & Actor Analysis", "reason": "Actor/User field unmapped in dataset"})

        if has_dept:
            supported.append("Departmental Handoff Analysis")
        else:
            limited.append({"feature": "Departmental Handoff Analysis", "reason": "Department field unmapped"})

        unavailable.append({"feature": "Cost & Financial Simulation", "reason": "Cost attributes unmapped"})

        return {
            "compatibility_level": level,
            "compatibility_level_label": level_label,
            "compatibility_score": score,
            "is_process_discoverable": True,
            "capabilities": capabilities,
            "supported": supported,
            "limited": limited,
            "unavailable": unavailable
        }
