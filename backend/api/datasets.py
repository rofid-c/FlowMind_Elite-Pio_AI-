import os
import shutil
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from backend.database import get_db
from backend.models import Project, Dataset, DatasetMapping, DatasetCapability
from backend.schemas import (
    DatasetResponse, DatasetMappingCreate, DatasetMappingResponse, DataPreviewResponse
)
from backend.config import settings
from backend.services.ingestion import (
    SchemaInspector, FormatClassifier, HybridSchemaMapper, CapabilityDetector, CanonicalTransformer
)

router = APIRouter(tags=["Datasets"])

@router.post("/projects/{project_id}/datasets", status_code=status.HTTP_201_CREATED)
def upload_dataset(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    filename = file.filename
    if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Invalid file type. Only CSV and XLSX are supported.")

    file_id = f"ds_{os.urandom(4).hex()}"
    saved_filename = f"{file_id}_{filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, saved_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    dataset = Dataset(
        id=file_id,
        project_id=project_id,
        filename=filename,
        file_path=file_path,
        status="UPLOADED"
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    # 1. Read preview & inspect
    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)

    inspection = SchemaInspector.inspect_dataframe(df)

    # 2. Hybrid Schema Mapping Proposal
    mapping_proposal = HybridSchemaMapper.propose_mapping(db, inspection)

    # 3. Format Classification
    classification = FormatClassifier.classify(inspection, mapping_proposal["mapping"].get("case_id"))

    # 4. Capability Forecast
    capabilities = CapabilityDetector.detect_capabilities(mapping_proposal["mapping"], classification["format_type"])

    # Store initial capability record
    cap_rec = DatasetCapability(
        dataset_id=dataset.id,
        format_type=classification["format_type"],
        compatibility_level=capabilities["compatibility_level"],
        compatibility_score=capabilities["compatibility_score"],
        event_density=classification["event_density"],
        is_process_discoverable=classification["is_process_discoverable"],
        rejection_reason=classification["rejection_reason"],
        capabilities_json=capabilities["capabilities"]
    )
    db.add(cap_rec)
    db.commit()

    return {
        "data": {
            "id": dataset.id,
            "filename": dataset.filename,
            "status": dataset.status,
            "detected_columns": inspection["column_names"],
            "inspection": inspection,
            "mapping_proposal": mapping_proposal,
            "classification": classification,
            "capabilities": capabilities,
            "preview_rows": df.head(10).replace({pd.NA: None, float("nan"): None}).to_dict(orient="records")
        }
    }

@router.post("/datasets/{dataset_id}/inspect")
def inspect_dataset_schema(dataset_id: str, db: Session = Depends(get_db)):
    """Re-inspects schema and updates format & column profiling."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset or not os.path.exists(dataset.file_path):
        raise HTTPException(status_code=404, detail="Dataset file not found")

    df = pd.read_excel(dataset.file_path) if dataset.file_path.endswith((".xlsx", ".xls")) else pd.read_csv(dataset.file_path)
    inspection = SchemaInspector.inspect_dataframe(df)
    mapping_proposal = HybridSchemaMapper.propose_mapping(db, inspection)
    classification = FormatClassifier.classify(inspection, mapping_proposal["mapping"].get("case_id"))
    capabilities = CapabilityDetector.detect_capabilities(mapping_proposal["mapping"], classification["format_type"])

    return {
        "inspection": inspection,
        "mapping_proposal": mapping_proposal,
        "classification": classification,
        "capabilities": capabilities
    }

@router.post("/datasets/{dataset_id}/mapping/suggest")
def suggest_mapping(dataset_id: str, db: Session = Depends(get_db)):
    """Generates hybrid rule + statistical + Gemini AI column mapping proposals."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset or not os.path.exists(dataset.file_path):
        raise HTTPException(status_code=404, detail="Dataset file not found")

    df = pd.read_excel(dataset.file_path) if dataset.file_path.endswith((".xlsx", ".xls")) else pd.read_csv(dataset.file_path)
    inspection = SchemaInspector.inspect_dataframe(df)
    proposal = HybridSchemaMapper.propose_mapping(db, inspection)
    return proposal

@router.get("/datasets/{dataset_id}/capabilities")
def get_dataset_capabilities(dataset_id: str, db: Session = Depends(get_db)):
    """Returns capability matrix and data compatibility level for dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    mapping = dataset.mapping
    mapping_dict = {
        "case_id": mapping.case_id_col if mapping else None,
        "activity": mapping.activity_col if mapping else None,
        "timestamp": mapping.timestamp_col if mapping else None,
        "actor": mapping.actor_col if mapping else None,
        "department": mapping.department_col if mapping else None
    } if mapping else {}

    format_type = dataset.capability.format_type if dataset.capability else "EVENT_LOG"
    return CapabilityDetector.detect_capabilities(mapping_dict, format_type)

@router.get("/projects/{project_id}/datasets", response_model=List[DatasetResponse])
def list_datasets(project_id: str, db: Session = Depends(get_db)):
    return db.query(Dataset).filter(Dataset.project_id == project_id).all()

@router.get("/datasets/{dataset_id}", response_model=DatasetResponse)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset

@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    if os.path.exists(dataset.file_path):
        try:
            os.remove(dataset.file_path)
        except OSError:
            pass

    db.delete(dataset)
    db.commit()
    return None

@router.post("/datasets/{dataset_id}/mapping", response_model=DatasetMappingResponse)
def create_or_update_mapping(
    dataset_id: str,
    payload: DatasetMappingCreate,
    db: Session = Depends(get_db)
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    required_fields = [payload.case_id, payload.activity, payload.timestamp]
    if len(required_fields) != len(set(required_fields)):
        raise HTTPException(status_code=400, detail="Column mappings must be unique.")

    df = pd.read_excel(dataset.file_path) if dataset.file_path.endswith((".xlsx", ".xls")) else pd.read_csv(dataset.file_path, nrows=5)
    file_cols = set(df.columns)
    
    for f_val, f_name in [
        (payload.case_id, "case_id"),
        (payload.activity, "activity"),
        (payload.timestamp, "timestamp")
    ]:
        if f_val not in file_cols:
            raise HTTPException(status_code=400, detail=f"Column '{f_val}' mapped to {f_name} does not exist in dataset file.")

    mapping = db.query(DatasetMapping).filter(DatasetMapping.dataset_id == dataset_id).first()
    if not mapping:
        mapping = DatasetMapping(
            dataset_id=dataset_id,
            case_id_col=payload.case_id,
            activity_col=payload.activity,
            timestamp_col=payload.timestamp,
            actor_col=payload.actor,
            department_col=payload.department,
            custom_attributes=payload.custom_attributes or {}
        )
        db.add(mapping)
    else:
        mapping.case_id_col = payload.case_id
        mapping.activity_col = payload.activity
        mapping.timestamp_col = payload.timestamp
        mapping.actor_col = payload.actor
        mapping.department_col = payload.department
        mapping.custom_attributes = payload.custom_attributes or {}

    dataset.status = "MAPPED"
    db.commit()
    db.refresh(mapping)
    return mapping

@router.get("/datasets/{dataset_id}/mapping", response_model=DatasetMappingResponse)
def get_mapping(dataset_id: str, db: Session = Depends(get_db)):
    mapping = db.query(DatasetMapping).filter(DatasetMapping.dataset_id == dataset_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found for this dataset")
    return mapping

@router.post("/datasets/{dataset_id}/preview", response_model=DataPreviewResponse)
def preview_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not dataset.mapping:
        raise HTTPException(status_code=400, detail="Please define column mapping before preview.")

    # Read and evaluate
    df = pd.read_excel(dataset.file_path) if dataset.file_path.endswith((".xlsx", ".xls")) else pd.read_csv(dataset.file_path)
    total_rows = len(df)
    case_col = dataset.mapping.case_id_col
    act_col = dataset.mapping.activity_col
    time_col = dataset.mapping.timestamp_col

    parsed_time = pd.to_datetime(df[time_col], errors="coerce", format="mixed")
    invalid_timestamps = int(parsed_time.isna().sum())
    valid_rows = int(df.dropna(subset=[case_col, act_col]).loc[parsed_time.notna()].shape[0])
    unique_cases = int(df[case_col].nunique())
    unique_activities = int(df[act_col].nunique())

    # Missing values dict (both raw columns and canonical roles)
    missing_dict = {str(c): round((df[c].isna().sum() / max(1, total_rows)) * 100.0, 2) for c in df.columns}
    missing_dict["case_id"] = round((df[case_col].isna().sum() / max(1, total_rows)) * 100.0, 2)
    missing_dict["activity"] = round((df[act_col].isna().sum() / max(1, total_rows)) * 100.0, 2)
    missing_dict["timestamp"] = round((df[time_col].isna().sum() / max(1, total_rows)) * 100.0, 2)
    if dataset.mapping.actor_col and dataset.mapping.actor_col in df.columns:
        missing_dict["actor"] = round((df[dataset.mapping.actor_col].isna().sum() / max(1, total_rows)) * 100.0, 2)
    if dataset.mapping.department_col and dataset.mapping.department_col in df.columns:
        missing_dict["department"] = round((df[dataset.mapping.department_col].isna().sum() / max(1, total_rows)) * 100.0, 2)

    duplicates_pct = round((df.duplicated().sum() / max(1, total_rows)) * 100.0, 2)

    # Convert timestamps and NaNs to serializable strings/None for sample_records
    sample_df = df.head(10).copy()
    sample_df[time_col] = sample_df[time_col].astype(str)
    clean_sample = sample_df.replace({pd.NA: None, float("nan"): None}).to_dict(orient="records")

    return {
        "rows": total_rows,
        "columns": [str(c) for c in df.columns],
        "unique_cases": unique_cases,
        "unique_activities": unique_activities,
        "missing_values": missing_dict,
        "potential_duplicates": duplicates_pct,
        "invalid_timestamps": invalid_timestamps,
        "quality_score": round((valid_rows / max(1, total_rows)) * 100.0, 1),
        "sample_records": clean_sample
    }

@router.post("/datasets/{dataset_id}/confirm", response_model=DatasetResponse)
def confirm_and_ingest_dataset(dataset_id: str, db: Session = Depends(get_db)):
    """User confirmation step: transforms to canonical event model, saves to memory, and marks READY."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not dataset.mapping:
        raise HTTPException(status_code=400, detail="Column mapping is required before confirmation.")

    mapping_dict = {
        "case_id": dataset.mapping.case_id_col,
        "activity": dataset.mapping.activity_col,
        "timestamp": dataset.mapping.timestamp_col,
        "actor": dataset.mapping.actor_col,
        "department": dataset.mapping.department_col,
        "custom_attributes": dataset.mapping.custom_attributes
    }

    CanonicalTransformer.transform_and_load(db, dataset_id, mapping_dict)
    db.refresh(dataset)
    return dataset
