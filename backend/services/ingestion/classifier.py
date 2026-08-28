from typing import Dict, Any, List

class FormatClassifier:
    """
    Classifies dataset format into:
    - EVENT_LOG: multiple events per case with sequential timestamps.
    - TRANSACTION_TABLE: one record per case without observable event sequences.
    - UNKNOWN: insufficient columns or data to determine.

    Calculates Event Density and provides graceful rejection messages.
    """

    @staticmethod
    def classify(schema_profile: Dict[str, Any], suggested_case_col: str = None) -> Dict[str, Any]:
        total_rows = schema_profile.get("total_rows", 0)
        columns = schema_profile.get("columns", [])

        if total_rows == 0 or len(columns) == 0:
            return {
                "format_type": "UNKNOWN",
                "is_process_discoverable": False,
                "event_density": 0.0,
                "rejection_reason": "Dataset is completely empty or contains no readable columns.",
                "available_analysis": [],
                "unavailable_analysis": [
                    "process_discovery",
                    "transition_analysis",
                    "variant_analysis",
                    "rework_analysis"
                ]
            }

        # Identify candidate case ID column
        case_col_info = None
        if suggested_case_col:
            case_col_info = next((c for c in columns if c["name"] == suggested_case_col), None)

        if not case_col_info:
            case_candidates = [c for c in columns if c.get("is_case_id_candidate")]
            if case_candidates:
                # Pick the one with highest uniqueness ratio that isn't 1.0 (or closest to 0.1-0.9)
                case_col_info = max(case_candidates, key=lambda c: (c["unique_count"] > 1, c["unique_ratio"] < 1.0, c["unique_count"]))
            elif columns:
                case_col_info = columns[0]

        unique_cases = case_col_info["unique_count"] if case_col_info else total_rows
        event_density = round(total_rows / max(1, unique_cases), 2)

        has_timestamp = any(c.get("is_datetime_candidate") for c in columns)
        has_activity = any(c.get("is_activity_candidate") for c in columns)

        # Qualification rules
        if event_density <= 1.05 and total_rows > 10:
            # Transaction table (1 row per case)
            return {
                "format_type": "TRANSACTION_TABLE",
                "is_process_discoverable": False,
                "event_density": event_density,
                "case_identifier_col": case_col_info["name"] if case_col_info else None,
                "rejection_reason": (
                    f"FlowMind cannot discover a process graph from this dataset. "
                    f"The file appears to be a Transaction Table with an event density of {event_density} events/case "
                    f"({total_rows:,} rows for {unique_cases:,} unique cases), which contains no sequential process transitions."
                ),
                "available_analysis": [
                    "dataset_profiling",
                    "descriptive_statistics",
                    "column_distribution"
                ],
                "unavailable_analysis": [
                    "process_discovery",
                    "transition_bottlenecks",
                    "variant_analysis",
                    "rework_detection"
                ]
            }

        if not has_timestamp or not has_activity:
            missing = []
            if not has_timestamp: missing.append("valid timestamp column")
            if not has_activity: missing.append("discrete activity/status column")
            return {
                "format_type": "UNKNOWN",
                "is_process_discoverable": False,
                "event_density": event_density,
                "rejection_reason": f"Missing minimum requirements for process reconstruction: {', '.join(missing)}.",
                "available_analysis": ["dataset_profiling"],
                "unavailable_analysis": ["process_discovery", "variant_analysis"]
            }

        return {
            "format_type": "EVENT_LOG",
            "is_process_discoverable": True,
            "event_density": event_density,
            "case_identifier_col": case_col_info["name"] if case_col_info else None,
            "rejection_reason": None,
            "available_analysis": [
                "process_discovery",
                "cycle_time_percentiles",
                "transition_bottlenecks",
                "variant_analysis",
                "rework_detection",
                "sla_compliance"
            ],
            "unavailable_analysis": []
        }
