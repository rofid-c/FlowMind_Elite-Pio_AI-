import os
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from backend.models import Dataset, DatasetMapping, Event, Project

class IngestionEngine:

    @staticmethod
    def inspect_file(file_path: str) -> Dict[str, Any]:
        """Inspect file headers and top 5 rows."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path, nrows=5)
        elif file_path.endswith((".xlsx", ".xls")):
            df = pd.read_excel(file_path, nrows=5)
        else:
            raise ValueError("Unsupported file format. Please upload CSV or XLSX.")

        return {
            "columns": df.columns.tolist(),
            "preview_rows": df.fillna("").to_dict(orient="records")
        }

    @staticmethod
    def evaluate_data_quality(file_path: str, mapping: DatasetMapping) -> Dict[str, Any]:
        """Calculates data quality metrics and preview for the dataset."""
        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)

        total_rows = len(df)
        if total_rows == 0:
            return {
                "rows": 0,
                "columns": df.columns.tolist(),
                "unique_cases": 0,
                "unique_activities": 0,
                "missing_values": {},
                "potential_duplicates": 0.0,
                "invalid_timestamps": 0,
                "quality_score": 0.0,
                "sample_records": []
            }

        # Check required mapped columns
        missing_dict = {}
        for col_field, col_name in [
            ("case_id", mapping.case_id_col),
            ("activity", mapping.activity_col),
            ("timestamp", mapping.timestamp_col),
            ("actor", mapping.actor_col),
            ("department", mapping.department_col)
        ]:
            if col_name and col_name in df.columns:
                missing_count = df[col_name].isna().sum()
                missing_dict[col_field] = round((missing_count / total_rows) * 100, 2)
            elif col_name:
                missing_dict[col_field] = 100.0

        # Validate timestamps
        invalid_ts_count = 0
        if mapping.timestamp_col in df.columns:
            ts_series = pd.to_datetime(df[mapping.timestamp_col], errors="coerce")
            invalid_ts_count = int(ts_series.isna().sum())

        # Check duplicate candidates
        dup_rate = 0.0
        subset_cols = [c for c in [mapping.case_id_col, mapping.activity_col, mapping.timestamp_col] if c in df.columns]
        if subset_cols:
            dups = df.duplicated(subset=subset_cols).sum()
            dup_rate = round((dups / total_rows) * 100, 2)

        # Unique counts
        unique_cases = int(df[mapping.case_id_col].nunique()) if mapping.case_id_col in df.columns else 0
        unique_acts = int(df[mapping.activity_col].nunique()) if mapping.activity_col in df.columns else 0

        # Calculate quality score (0 to 100)
        missing_ts_rate = missing_dict.get("timestamp", 0.0) / 100.0
        missing_case_rate = missing_dict.get("case_id", 0.0) / 100.0
        missing_act_rate = missing_dict.get("activity", 0.0) / 100.0
        invalid_rate = (invalid_ts_count / total_rows) if total_rows > 0 else 0.0
        dup_frac = dup_rate / 100.0

        penalty = (missing_case_rate * 30) + (missing_act_rate * 30) + (missing_ts_rate * 20) + (invalid_rate * 10) + (dup_frac * 10)
        quality_score = max(0.0, min(100.0, round(100.0 - penalty * 100, 2)))

        sample_records = df.head(10).fillna("").to_dict(orient="records")

        return {
            "rows": total_rows,
            "columns": df.columns.tolist(),
            "unique_cases": unique_cases,
            "unique_activities": unique_acts,
            "missing_values": missing_dict,
            "potential_duplicates": dup_rate,
            "invalid_timestamps": invalid_ts_count,
            "quality_score": quality_score,
            "sample_records": sample_records
        }

    @staticmethod
    def persist_normalized_events(db: Session, dataset_id: str) -> Dataset:
        """Reads file, cleans, normalizes, and saves events to the database."""
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise ValueError("Dataset not found")
        if not dataset.mapping:
            raise ValueError("Dataset mapping not found")

        mapping = dataset.mapping
        file_path = dataset.file_path

        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)

        # Clear existing events if any
        db.query(Event).filter(Event.dataset_id == dataset_id).delete()

        # Clean rows with missing required columns
        req_cols = [mapping.case_id_col, mapping.activity_col, mapping.timestamp_col]
        df = df.dropna(subset=[c for c in req_cols if c in df.columns]).copy()

        # Parse timestamp
        df["_parsed_ts"] = pd.to_datetime(df[mapping.timestamp_col], errors="coerce")
        df = df.dropna(subset=["_parsed_ts"]).copy()

        events_to_create = []
        for _, row in df.iterrows():
            custom_attrs = {}
            if mapping.custom_attributes:
                for k, col in mapping.custom_attributes.items():
                    if col in row:
                        custom_attrs[k] = None if pd.isna(row[col]) else str(row[col])

            actor_val = str(row[mapping.actor_col]) if mapping.actor_col and mapping.actor_col in row and pd.notna(row[mapping.actor_col]) else None
            dept_val = str(row[mapping.department_col]) if mapping.department_col and mapping.department_col in row and pd.notna(row[mapping.department_col]) else None

            event = Event(
                dataset_id=dataset_id,
                case_id=str(row[mapping.case_id_col]),
                activity=str(row[mapping.activity_col]).strip(),
                timestamp=row["_parsed_ts"].to_pydatetime(),
                actor=actor_val,
                department=dept_val,
                attributes=custom_attrs
            )
            events_to_create.append(event)

        db.bulk_save_objects(events_to_create)

        # Update dataset stats
        quality_eval = IngestionEngine.evaluate_data_quality(file_path, mapping)
        dataset.row_count = len(events_to_create)
        dataset.case_count = int(df[mapping.case_id_col].nunique()) if len(df) > 0 else 0
        dataset.activity_count = int(df[mapping.activity_col].nunique()) if len(df) > 0 else 0
        dataset.quality_score = quality_eval["quality_score"]
        dataset.status = "READY"

        # Update project state if needed
        if dataset.project:
            dataset.project.state = "DATASET_ADDED"

        db.commit()
        db.refresh(dataset)
        return dataset
