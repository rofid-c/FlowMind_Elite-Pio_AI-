import os
import pytest
import pandas as pd
from backend.database import SessionLocal, engine, Base
from backend.models import Project, Dataset, DatasetMapping, SchemaProfile, DatasetCapability, Event
from backend.services.ingestion import (
    SchemaInspector, FormatClassifier, HybridSchemaMapper, CapabilityDetector, CanonicalTransformer, MappingProfileManager
)

@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()

def test_1_known_schema_inspection():
    """TEST 1: Standard event log schema inspection and profiling."""
    df = pd.DataFrame({
        "case_id": ["C1", "C1", "C2", "C2", "C3", "C3"],
        "activity": ["Submit", "Approve", "Submit", "Review", "Submit", "Approve"],
        "timestamp": ["2026-08-01 08:00:00", "2026-08-01 10:00:00", "2026-08-01 08:30:00", "2026-08-01 09:30:00", "2026-08-01 09:00:00", "2026-08-01 11:00:00"],
        "actor": ["Alice", "Bob", "Alice", "Charlie", "Alice", "Bob"]
    })
    inspection = SchemaInspector.inspect_dataframe(df)
    assert inspection["total_rows"] == 6
    assert inspection["total_columns"] == 4
    assert any(c["name"] == "case_id" and c["is_case_id_candidate"] for c in inspection["columns"])
    assert any(c["name"] == "timestamp" and c["is_datetime_candidate"] for c in inspection["columns"])

def test_2_different_column_names_mapping(db):
    """TEST 2: Non-standard column names (ticket_id, status, created_at, assigned_to) -> mapping suggestion."""
    df = pd.DataFrame({
        "ticket_id": [f"TK{i//2}" for i in range(10)],
        "status": ["Open", "In Progress"] * 5,
        "created_at": ["2026-08-01 08:00:00"] * 10,
        "assigned_to": ["Agent A", "Agent B"] * 5
    })
    inspection = SchemaInspector.inspect_dataframe(df)
    proposal = HybridSchemaMapper.propose_mapping(db, inspection)
    
    assert proposal["mapping"]["case_id"] == "ticket_id"
    assert proposal["mapping"]["activity"] == "status"
    assert proposal["mapping"]["timestamp"] == "created_at"
    assert proposal["confidence_level"] in ("HIGH", "MEDIUM")

def test_3_transaction_table_graceful_rejection(db):
    """TEST 4: Non-event dataset (Transaction Table with 1 row per case) -> graceful rejection."""
    df = pd.DataFrame({
        "customer_id": [f"CUST_{i}" for i in range(50)],
        "age": [20 + i for i in range(50)],
        "income": [50000 + i * 1000 for i in range(50)],
        "city": ["Jakarta"] * 50
    })
    inspection = SchemaInspector.inspect_dataframe(df)
    classification = FormatClassifier.classify(inspection)
    
    assert classification["format_type"] in ("TRANSACTION_TABLE", "UNKNOWN")
    assert classification["is_process_discoverable"] == False
    assert classification["rejection_reason"] is not None
    assert "process_discovery" in classification["unavailable_analysis"]

def test_4_missing_optional_fields_partial_capability():
    """TEST 5: Missing actor field -> partial capability detection."""
    mapping = {
        "case_id": "case_ref",
        "activity": "process_step",
        "timestamp": "logged_time"
        # No actor or department
    }
    caps = CapabilityDetector.detect_capabilities(mapping, format_type="EVENT_LOG")
    assert caps["compatibility_level"] == 1
    assert caps["capabilities"]["process_discovery"] == True
    assert caps["capabilities"]["cycle_time"] == True
    assert caps["capabilities"]["actor_analysis"] == False
    assert any(l["feature"] == "Resource & Actor Analysis" for l in caps["limited"])

def test_5_mapping_memory_profile_persistence(db):
    """TEST 6: Mapping Memory saves confirmed schema and matches on next upload."""
    col_names = ["order_reference_no", "workflow_stage", "stage_timestamp", "handler"]
    mapping = {
        "case_id": "order_reference_no",
        "activity": "workflow_stage",
        "timestamp": "stage_timestamp",
        "actor": "handler"
    }
    
    # Save profile
    profile = MappingProfileManager.save_confirmed_mapping(db, col_names, mapping)
    assert profile.fingerprint is not None
    
    # Lookup on subsequent upload
    matched = MappingProfileManager.find_matching_profile(db, col_names)
    assert matched is not None
    assert matched["match_type"] == "EXACT_PROFILE_MATCH"
    assert matched["mapping"]["case_id"] == "order_reference_no"
