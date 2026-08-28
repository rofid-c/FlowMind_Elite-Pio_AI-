import json
import subprocess
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from .profiles import MappingProfileManager
from backend.config import settings

logger = logging.getLogger(__name__)

# Heuristic keyword matchers
CASE_ID_KEYWORDS = [
    "case_id", "caseid", "case_number", "case_no", "ticket_id", "ticket_no",
    "order_id", "order_number", "claim_id", "claim_number", "transaction_id",
    "request_id", "request_no", "incident_id", "incident_number", "application_id",
    "job_id", "process_id", "id", "case_ref"
]

ACTIVITY_KEYWORDS = [
    "activity", "activity_name", "event", "event_name", "status", "current_status",
    "step", "process_step", "task", "task_name", "action", "state", "stage",
    "phase", "milestone"
]

TIMESTAMP_KEYWORDS = [
    "timestamp", "event_time", "created_at", "create_date", "creation_time",
    "datetime", "time", "date", "logged_at", "recorded_at", "updated_at",
    "start_time", "end_time", "completed_at", "closed_at"
]

ACTOR_KEYWORDS = [
    "actor", "resource", "agent", "assigned_to", "user", "username", "operator",
    "technician", "handler", "owner", "performer", "employee"
]

DEPARTMENT_KEYWORDS = [
    "department", "dept", "team", "group", "division", "unit", "organization", "org"
]


class HybridSchemaMapper:
    """
    Implements Tri-Source Hybrid Mapping Strategy:
    1. Saved Mapping Profile Memory
    2. Deterministic Name & Statistical Heuristics (Weights: Name, Type, Stats)
    3. Multi-Timestamp Column Classification
    4. Gemini Pro AI Mapping Proposal (Adaptive Fallback)
    """

    @classmethod
    def propose_mapping(
        cls,
        db: Session,
        schema_profile: Dict[str, Any],
        org_id: str = "default"
    ) -> Dict[str, Any]:
        column_names = schema_profile.get("column_names", [])
        columns = schema_profile.get("columns", [])

        # 1. Check Saved Profile Memory (Urutan 1)
        saved_profile = MappingProfileManager.find_matching_profile(db, column_names, org_id)
        if saved_profile:
            return {
                "mapping": saved_profile["mapping"],
                "confidence_score": 0.99,
                "confidence_level": "HIGH",
                "mapping_method": "SAVED_PROFILE",
                "explanation": f"Matched previous confirmed schema profile (used {saved_profile['usage_count']}x).",
                "timestamp_candidates": cls._classify_timestamps(columns),
                "alternatives": {}
            }

        # 2. Tri-Source Deterministic Scoring (Urutan 2 & 3)
        scores = {
            "case_id": {},
            "activity": {},
            "timestamp": {},
            "actor": {},
            "department": {}
        }

        for col in columns:
            name = col["name"].lower().strip()
            dtype = col["dtype"]
            unique_ratio = col["unique_ratio"]
            is_dt = col["is_datetime_candidate"]

            # Score CASE_ID
            name_score = cls._keyword_similarity(name, CASE_ID_KEYWORDS)
            type_score = 1.0 if dtype in ("string", "integer") and not is_dt else 0.0
            stat_score = 1.0 if col["is_case_id_candidate"] else 0.2
            scores["case_id"][col["name"]] = round(0.4 * name_score + 0.2 * type_score + 0.4 * stat_score, 3)

            # Score ACTIVITY
            name_score = cls._keyword_similarity(name, ACTIVITY_KEYWORDS)
            type_score = 1.0 if dtype == "string" and not is_dt else 0.0
            stat_score = 1.0 if col["is_activity_candidate"] else 0.2
            scores["activity"][col["name"]] = round(0.45 * name_score + 0.2 * type_score + 0.35 * stat_score, 3)

            # Score TIMESTAMP
            name_score = cls._keyword_similarity(name, TIMESTAMP_KEYWORDS)
            type_score = 1.0 if is_dt else (0.4 if "date" in name or "time" in name else 0.0)
            stat_score = 1.0 if is_dt else 0.0
            scores["timestamp"][col["name"]] = round(0.35 * name_score + 0.35 * type_score + 0.3 * stat_score, 3)

            # Score ACTOR
            name_score = cls._keyword_similarity(name, ACTOR_KEYWORDS)
            type_score = 1.0 if dtype in ("string", "integer") and not is_dt else 0.0
            stat_score = 1.0 if col["is_resource_candidate"] else 0.2
            scores["actor"][col["name"]] = round(0.5 * name_score + 0.2 * type_score + 0.3 * stat_score, 3)

            # Score DEPARTMENT
            name_score = cls._keyword_similarity(name, DEPARTMENT_KEYWORDS)
            type_score = 1.0 if dtype == "string" and not is_dt else 0.0
            stat_score = 0.8 if col["unique_count"] <= 50 else 0.2
            scores["department"][col["name"]] = round(0.55 * name_score + 0.2 * type_score + 0.25 * stat_score, 3)

        # Select top candidate for each target role ensuring no duplicates for primary keys
        best_mapping = {}
        confidence_details = {}

        # Best Case ID
        sorted_case = sorted(scores["case_id"].items(), key=lambda x: x[1], reverse=True)
        if sorted_case and sorted_case[0][1] >= 0.35:
            best_mapping["case_id"] = sorted_case[0][0]
            confidence_details["case_id"] = sorted_case[0][1]

        # Best Timestamp
        sorted_time = sorted(scores["timestamp"].items(), key=lambda x: x[1], reverse=True)
        if sorted_time and sorted_time[0][1] >= 0.35:
            best_mapping["timestamp"] = sorted_time[0][0]
            confidence_details["timestamp"] = sorted_time[0][1]

        # Best Activity (avoid picking same as case_id or timestamp)
        sorted_act = [x for x in sorted(scores["activity"].items(), key=lambda x: x[1], reverse=True) if x[0] != best_mapping.get("case_id") and x[0] != best_mapping.get("timestamp")]
        if sorted_act and sorted_act[0][1] >= 0.3:
            best_mapping["activity"] = sorted_act[0][0]
            confidence_details["activity"] = sorted_act[0][1]

        # Best Actor
        sorted_actor = [x for x in sorted(scores["actor"].items(), key=lambda x: x[1], reverse=True) if x[0] not in best_mapping.values()]
        if sorted_actor and sorted_actor[0][1] >= 0.45:
            best_mapping["actor"] = sorted_actor[0][0]

        # Best Department
        sorted_dept = [x for x in sorted(scores["department"].items(), key=lambda x: x[1], reverse=True) if x[0] not in best_mapping.values()]
        if sorted_dept and sorted_dept[0][1] >= 0.45:
            best_mapping["department"] = sorted_dept[0][0]

        overall_conf = round(sum(confidence_details.values()) / max(1, len(confidence_details)), 2)
        conf_level = "HIGH" if overall_conf >= 0.7 else "MEDIUM" if overall_conf >= 0.4 else "LOW"

        # 4. Gemini Pro AI Mapping Proposal (If ambiguous or confidence is medium/low)
        ai_proposal = None
        if conf_level != "HIGH":
            ai_proposal = cls._query_gemini_mapping(schema_profile)
            if ai_proposal and ai_proposal.get("mappings"):
                for m in ai_proposal["mappings"]:
                    src = m.get("source")
                    tgt = m.get("target")
                    if src in column_names and tgt in ("case_id", "activity", "timestamp", "actor", "department"):
                        best_mapping[tgt] = src
                conf_level = "HIGH"
                overall_conf = max(overall_conf, 0.88)

        return {
            "mapping": best_mapping,
            "confidence_score": overall_conf,
            "confidence_level": conf_level,
            "mapping_method": "AI_HYBRID" if ai_proposal else "DETERMINISTIC_HEURISTICS",
            "explanation": "Heuristic and statistical evidence identified key process event roles.",
            "timestamp_candidates": cls._classify_timestamps(columns),
            "alternatives": {
                "case_id": [x[0] for x in sorted_case[:3]],
                "activity": [x[0] for x in sorted_act[:3]],
                "timestamp": [x[0] for x in sorted_time[:3]]
            }
        }

    @staticmethod
    def _keyword_similarity(col_name: str, keywords: List[str]) -> float:
        c = col_name.lower().replace("-", "_").replace(" ", "_")
        if c in keywords:
            return 1.0
        for kw in keywords:
            if kw in c or c in kw:
                return 0.8
        return 0.0

    @staticmethod
    def _classify_timestamps(columns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Classifies multiple timestamp columns (created_at, started_at, completed_at, closed_at)."""
        dt_cols = [c for c in columns if c.get("is_datetime_candidate")]
        results = []
        for col in dt_cols:
            name = col["name"].lower()
            role = "event_time"
            if any(k in name for k in ("create", "open", "start", "submit", "init")):
                role = "case_start_candidate"
            elif any(k in name for k in ("close", "end", "finish", "complete", "resolved")):
                role = "case_end_candidate"
            elif any(k in name for k in ("update", "modifi", "change")):
                role = "lifecycle_update"

            results.append({
                "column": col["name"],
                "inferred_role": role,
                "null_rate": col["null_rate"],
                "sample": col["sample_values"][0] if col["sample_values"] else None
            })
        return results

    @classmethod
    def _query_gemini_mapping(cls, schema_profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Calls Gemini CLI with compact sampled schema metadata (Zero raw dataset leak)."""
        agy_bin = r"C:\Users\rfd23\AppData\Local\agy\bin\agy.exe"
        sampled_context = {
            "columns": [
                {
                    "name": c["name"],
                    "dtype": c["dtype"],
                    "unique_ratio": c["unique_ratio"],
                    "samples": c["sample_values"][:3]
                }
                for c in schema_profile.get("columns", [])[:20]
            ]
        }

        prompt = (
            "You are FlowMind AI Schema Intelligence Mapper. Map the incoming dataset columns to standard Process Mining Canonical fields.\n"
            "Canonical targets: 'case_id' (mandatory), 'activity' (mandatory), 'timestamp' (mandatory), 'actor' (optional), 'department' (optional).\n\n"
            f"DATASET PROFILE:\n{json.dumps(sampled_context, indent=2)}\n\n"
            "Respond ONLY with raw JSON:\n"
            "{\n"
            '  "mappings": [\n'
            '    {"source": "ColumnName", "target": "case_id", "confidence": 0.95},\n'
            '    {"source": "ColumnName", "target": "activity", "confidence": 0.90},\n'
            '    {"source": "ColumnName", "target": "timestamp", "confidence": 0.98}\n'
            "  ]\n"
            "}"
        )

        try:
            res = subprocess.run(
                [agy_bin, "-p", prompt, "--output-format", "text", "--disable-slash-commands"],
                capture_output=True, text=True, timeout=20, encoding="utf-8", errors="replace"
            )
            if res.returncode == 0 and res.stdout.strip():
                raw = res.stdout.strip()
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                return json.loads(raw)
        except Exception as e:
            logger.info(f"Gemini schema mapper CLI skipped: {e}")
        return None
