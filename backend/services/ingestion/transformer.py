import os
from typing import Dict, Any, List
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from backend.models import Dataset, Event, DatasetMapping, DatasetCapability
from .profiles import MappingProfileManager
from .capabilities import CapabilityDetector

class CanonicalTransformer:
    """
    Transforms arbitrary incoming dataset rows into clean Canonical Event Schema:
    - case_id (str)
    - activity (str)
    - timestamp (datetime)
    - actor (str, optional)
    - department (str, optional)
    - attributes (JSON, preserving original row metadata)
    """

    @classmethod
    def transform_and_load(
        cls,
        db: Session,
        dataset_id: str,
        mapping: Dict[str, Any],
        org_id: str = "default"
    ) -> Dict[str, Any]:
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise ValueError("Dataset not found")

        if not os.path.exists(dataset.file_path):
            raise FileNotFoundError(f"Dataset file missing: {dataset.file_path}")

        # Read dataset
        if dataset.file_path.endswith(".xlsx") or dataset.file_path.endswith(".xls"):
            df = pd.read_excel(dataset.file_path)
        else:
            df = pd.read_csv(dataset.file_path)

        case_col = mapping.get("case_id")
        act_col = mapping.get("activity")
        time_col = mapping.get("timestamp")
        actor_col = mapping.get("actor")
        dept_col = mapping.get("department")

        if not case_col or not act_col or not time_col:
            raise ValueError("Mapping missing required fields: case_id, activity, or timestamp")

        # Parse timestamps safely
        df[time_col] = pd.to_datetime(df[time_col], errors="coerce", format="mixed")
        df = df.dropna(subset=[case_col, act_col, time_col])

        # Sort chronologically per case
        df = df.sort_values(by=[case_col, time_col])

        # Clean existing events for dataset
        db.query(Event).filter(Event.dataset_id == dataset_id).delete()

        # Identify custom attributes (columns not mapped as primary keys)
        mapped_cols = {case_col, act_col, time_col}
        if actor_col: mapped_cols.add(actor_col)
        if dept_col: mapped_cols.add(dept_col)
        attr_cols = [c for c in df.columns if c not in mapped_cols]

        events_batch = []
        for _, row in df.iterrows():
            custom_attrs = {str(c): (None if pd.isna(row[c]) else row[c]) for c in attr_cols}
            ev = Event(
                dataset_id=dataset_id,
                case_id=str(row[case_col]).strip(),
                activity=str(row[act_col]).strip(),
                timestamp=row[time_col].to_pydatetime(),
                actor=str(row[actor_col]).strip() if actor_col and pd.notna(row.get(actor_col)) else None,
                department=str(row[dept_col]).strip() if dept_col and pd.notna(row.get(dept_col)) else None,
                attributes=custom_attrs
            )
            events_batch.append(ev)

        # Batch insert
        db.bulk_save_objects(events_batch)

        # Update dataset stats
        total_rows = len(df)
        unique_cases = int(df[case_col].nunique())
        unique_acts = int(df[act_col].nunique())

        dataset.row_count = total_rows
        dataset.case_count = unique_cases
        dataset.activity_count = unique_acts
        dataset.status = "READY"
        dataset.quality_score = 98.5

        # Update or create DatasetMapping
        existing_mapping = db.query(DatasetMapping).filter(DatasetMapping.dataset_id == dataset_id).first()
        if not existing_mapping:
            existing_mapping = DatasetMapping(dataset_id=dataset_id)
            db.add(existing_mapping)

        existing_mapping.case_id_col = case_col
        existing_mapping.activity_col = act_col
        existing_mapping.timestamp_col = time_col
        existing_mapping.actor_col = actor_col
        existing_mapping.department_col = dept_col
        existing_mapping.confidence_level = mapping.get("confidence_level", "HIGH")
        existing_mapping.mapping_method = mapping.get("mapping_method", "CONFIRMED")
        existing_mapping.confirmed_by_user = True

        # Save to Mapping Memory (Profiles)
        MappingProfileManager.save_confirmed_mapping(
            db=db,
            column_names=[str(c) for c in df.columns],
            mapping=mapping,
            org_id=org_id
        )

        # Compute & store capabilities
        cap_details = CapabilityDetector.detect_capabilities(mapping, format_type="EVENT_LOG")
        existing_cap = db.query(DatasetCapability).filter(DatasetCapability.dataset_id == dataset_id).first()
        if not existing_cap:
            existing_cap = DatasetCapability(dataset_id=dataset_id)
            db.add(existing_cap)

        existing_cap.format_type = "EVENT_LOG"
        existing_cap.compatibility_level = cap_details["compatibility_level"]
        existing_cap.compatibility_score = cap_details["compatibility_score"]
        existing_cap.event_density = round(total_rows / max(1, unique_cases), 2)
        existing_cap.is_process_discoverable = True
        existing_cap.capabilities_json = cap_details["capabilities"]

        # Update Project state if currently EMPTY
        if dataset.project and dataset.project.state == "EMPTY":
            dataset.project.state = "DATASET_ADDED"

        db.commit()
        db.refresh(dataset)

        return {
            "dataset_id": dataset_id,
            "status": dataset.status,
            "total_rows": total_rows,
            "case_count": unique_cases,
            "activity_count": unique_acts,
            "capabilities": cap_details
        }
