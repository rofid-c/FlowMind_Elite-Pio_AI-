import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, ForeignKey, Text, JSON, Boolean
)
from sqlalchemy.orm import relationship
from backend.database import Base

def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(50), primary_key=True, default=lambda: generate_id("proj"))
    name = Column(String(255), nullable=False)
    process_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    state = Column(String(50), default="EMPTY")  # EMPTY, DATASET_ADDED, ANALYZED, INSIGHTS_AVAILABLE, SCENARIO_AVAILABLE
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    datasets = relationship("Dataset", back_populates="project", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="project", cascade="all, delete-orphan")
    scenarios = relationship("Scenario", back_populates="project", cascade="all, delete-orphan")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String(50), primary_key=True, default=lambda: generate_id("ds"))
    project_id = Column(String(50), ForeignKey("projects.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    status = Column(String(50), default="UPLOADED")  # UPLOADED, INSPECTED, MAPPED, READY, REJECTED
    row_count = Column(Integer, default=0)
    case_count = Column(Integer, default=0)
    activity_count = Column(Integer, default=0)
    quality_score = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="datasets")
    mapping = relationship("DatasetMapping", back_populates="dataset", uselist=False, cascade="all, delete-orphan")
    capability = relationship("DatasetCapability", back_populates="dataset", uselist=False, cascade="all, delete-orphan")
    events = relationship("Event", back_populates="dataset", cascade="all, delete-orphan")
    analyses = relationship("Analysis", back_populates="dataset", cascade="all, delete-orphan")


class DatasetMapping(Base):
    __tablename__ = "dataset_mappings"

    id = Column(String(50), primary_key=True, default=lambda: generate_id("map"))
    dataset_id = Column(String(50), ForeignKey("datasets.id"), nullable=False, unique=True)
    case_id_col = Column(String(100), nullable=False)
    activity_col = Column(String(100), nullable=False)
    timestamp_col = Column(String(100), nullable=False)
    actor_col = Column(String(100), nullable=True)
    department_col = Column(String(100), nullable=True)
    custom_attributes = Column(JSON, default=dict)
    
    # Ingestion Intelligence Audit Fields
    confidence_score = Column(Float, default=1.0)
    confidence_level = Column(String(20), default="HIGH")  # HIGH, MEDIUM, LOW
    mapping_method = Column(String(50), default="RULE_BASED")  # EXACT, PROFILE, AI_SUGGESTED, MANUAL
    confirmed_by_user = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    dataset = relationship("Dataset", back_populates="mapping")


class SchemaProfile(Base):
    """Stores user-confirmed schema mapping fingerprints for instant automatic memory."""
    __tablename__ = "schema_profiles"

    id = Column(String(50), primary_key=True, default=lambda: generate_id("prof"))
    organization_id = Column(String(100), default="default", index=True)
    fingerprint = Column(String(255), unique=True, index=True, nullable=False)
    column_signature_json = Column(JSON, nullable=False)
    mapping_json = Column(JSON, nullable=False)
    confirmed_by_user = Column(Boolean, default=True)
    usage_count = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DatasetCapability(Base):
    """Stores dataset qualification, format classification, and capability matrix."""
    __tablename__ = "dataset_capabilities"

    id = Column(String(50), primary_key=True, default=lambda: generate_id("cap"))
    dataset_id = Column(String(50), ForeignKey("datasets.id"), nullable=False, unique=True)
    format_type = Column(String(50), default="EVENT_LOG")  # EVENT_LOG, TRANSACTION_TABLE, UNKNOWN
    compatibility_level = Column(Integer, default=1)  # 0=Unsupported, 1=Basic, 2=Enriched, 3=Simulation Ready
    compatibility_score = Column(Float, default=100.0)
    event_density = Column(Float, default=1.0)
    is_process_discoverable = Column(Boolean, default=True)
    rejection_reason = Column(Text, nullable=True)
    capabilities_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    dataset = relationship("Dataset", back_populates="capability")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_id = Column(String(50), ForeignKey("datasets.id"), nullable=False, index=True)
    case_id = Column(String(100), nullable=False, index=True)
    activity = Column(String(200), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    actor = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    attributes = Column(JSON, default=dict)

    dataset = relationship("Dataset", back_populates="events")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String(50), primary_key=True, default=lambda: generate_id("an"))
    dataset_id = Column(String(50), ForeignKey("datasets.id"), nullable=False)
    engine_version = Column(String(50), default="0.1.0")
    status = Column(String(50), default="QUEUED")  # QUEUED, PROCESSING, COMPLETED, FAILED, CANCELLED
    stage = Column(String(50), default="INGESTION")  # INGESTION, RECONSTRUCTION, PROCESS_DISCOVERY, METRICS, FINDINGS, FINALIZATION
    progress = Column(Integer, default=0)
    configuration = Column(JSON, default=dict)
    
    summary_json = Column(JSON, nullable=True)
    process_graph_json = Column(JSON, nullable=True)
    metrics_json = Column(JSON, nullable=True)
    variants_json = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    dataset = relationship("Dataset", back_populates="analyses")
    findings = relationship("Finding", back_populates="analysis", cascade="all, delete-orphan")


class Finding(Base):
    __tablename__ = "findings"

    id = Column(String(50), primary_key=True, default=lambda: generate_id("find"))
    project_id = Column(String(50), ForeignKey("projects.id"), nullable=False)
    analysis_id = Column(String(50), ForeignKey("analyses.id"), nullable=False)
    type = Column(String(50), nullable=False)  # BOTTLENECK, REWORK, SLA_VIOLATION, VARIANT_ANOMALY
    title = Column(String(255), nullable=False)
    severity = Column(String(50), default="MEDIUM")  # CRITICAL, HIGH, MEDIUM, LOW
    what_observed = Column(Text, nullable=False)
    evidence_json = Column(JSON, default=dict)
    why_flagged = Column(Text, nullable=False)
    potential_causes_json = Column(JSON, default=list)
    recommendations_json = Column(JSON, default=list)
    evidence_strength = Column(String(50), default="MODERATE")  # HIGH, MODERATE, LOW
    status = Column(String(50), default="ACTIVE")
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="findings")
    analysis = relationship("Analysis", back_populates="findings")


class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(String(50), primary_key=True, default=lambda: generate_id("scen"))
    project_id = Column(String(50), ForeignKey("projects.id"), nullable=False)
    name = Column(String(255), nullable=False)
    change_type = Column(String(50), nullable=False)  # REDUCE_DURATION, REMOVE_ACTIVITY
    target = Column(String(255), nullable=False)  # e.g., "Review -> Approve"
    parameter_val = Column(Float, nullable=False)  # e.g. 30.0 for 30%
    assumptions_json = Column(JSON, default=dict)
    status = Column(String(50), default="DRAFT")  # DRAFT, COMPLETED, UNSUPPORTED
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="scenarios")
    simulation_results = relationship("SimulationResult", back_populates="scenario", cascade="all, delete-orphan")


class SimulationResult(Base):
    __tablename__ = "simulation_results"

    id = Column(String(50), primary_key=True, default=lambda: generate_id("sim"))
    scenario_id = Column(String(50), ForeignKey("scenarios.id"), nullable=False)
    analysis_id = Column(String(50), ForeignKey("analyses.id"), nullable=False)
    baseline_metrics_json = Column(JSON, nullable=False)
    simulated_metrics_json = Column(JSON, nullable=False)
    delta_json = Column(JSON, nullable=False)
    evidence_strength = Column(String(50), default="MODERATE")
    assumptions = Column(JSON, default=list)
    limitations = Column(JSON, default=list)
    calculation_details = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    scenario = relationship("Scenario", back_populates="simulation_results")
