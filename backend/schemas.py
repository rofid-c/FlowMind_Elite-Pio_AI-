from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict

# --- Project Schemas ---
class ProjectCreate(BaseModel):
    name: str = Field(..., description="Project Name")
    process_name: str = Field(..., description="Process Name")
    description: Optional[str] = Field(None, description="Project Description")

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    process_name: Optional[str] = None
    description: Optional[str] = None
    state: Optional[str] = None

class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    process_name: str
    description: Optional[str]
    state: str
    created_at: datetime
    updated_at: datetime


# --- Dataset Schemas ---
class DatasetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    filename: str
    status: str
    row_count: int
    case_count: int
    activity_count: int
    quality_score: float
    created_at: datetime

class DatasetMappingCreate(BaseModel):
    case_id: str = Field(..., description="Mapped case ID column")
    activity: str = Field(..., description="Mapped activity column")
    timestamp: str = Field(..., description="Mapped timestamp column")
    actor: Optional[str] = Field(None, description="Mapped actor column")
    department: Optional[str] = Field(None, description="Mapped department column")
    custom_attributes: Optional[Dict[str, str]] = Field(default_factory=dict)

class DatasetMappingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    dataset_id: str
    case_id_col: str
    activity_col: str
    timestamp_col: str
    actor_col: Optional[str]
    department_col: Optional[str]
    custom_attributes: Dict[str, Any]

class DataPreviewResponse(BaseModel):
    rows: int
    columns: List[str]
    unique_cases: int
    unique_activities: int
    missing_values: Dict[str, float]
    potential_duplicates: float
    invalid_timestamps: int
    quality_score: float
    sample_records: List[Dict[str, Any]]


# --- Analysis Schemas ---
class AnalysisCreate(BaseModel):
    sla_hours: Optional[float] = Field(24.0, description="Target SLA in hours")
    configuration: Optional[Dict[str, Any]] = Field(default_factory=dict)

class AnalysisStatusResponse(BaseModel):
    analysis_id: str
    dataset_id: str
    engine_version: str
    status: str
    stage: str
    progress: int

class ProcessGraphNode(BaseModel):
    id: str
    label: str
    frequency: int
    case_coverage_pct: float
    is_start: bool
    is_end: bool

class ProcessGraphEdge(BaseModel):
    source: str
    target: str
    frequency: int
    case_coverage_pct: float
    median_elapsed_hours: float
    p90_elapsed_hours: float
    min_elapsed_hours: float
    max_elapsed_hours: float

class ProcessGraphResponse(BaseModel):
    nodes: List[ProcessGraphNode]
    edges: List[ProcessGraphEdge]

class CaseMetrics(BaseModel):
    case_count: int
    median_cycle_time_hours: float
    p50_hours: float
    p75_hours: float
    p90_hours: float
    p95_hours: float
    mean_cycle_time_hours: float
    min_cycle_time_hours: float
    max_cycle_time_hours: float

class ProcessMetrics(BaseModel):
    total_variants: int
    rework_rate_pct: float
    sla_hours: float
    sla_compliance_pct: float
    sla_violation_count: int

class TransitionMetricItem(BaseModel):
    source: str
    target: str
    frequency: int
    median_elapsed_hours: float
    p90_elapsed_hours: float
    bottleneck_score: float

class ActivityMetricItem(BaseModel):
    activity: str
    frequency: int
    case_count: int
    case_coverage_pct: float

class MetricsResponse(BaseModel):
    case_metrics: CaseMetrics
    process_metrics: ProcessMetrics
    transition_metrics: List[TransitionMetricItem]
    activity_metrics: List[ActivityMetricItem]

class VariantItem(BaseModel):
    rank: int
    variant: str
    cases: int
    share_pct: float
    median_cycle_hours: float
    p90_cycle_hours: float

class VariantsResponse(BaseModel):
    total_cases: int
    total_variants: int
    variants: List[VariantItem]


# --- Finding Schemas ---
class FindingResponse(BaseModel):
    id: str
    project_id: str
    analysis_id: str
    type: str
    title: str
    severity: str
    what_observed: str
    evidence: Dict[str, Any]
    why_flagged: str
    potential_causes: List[str]
    recommendations: List[str]
    evidence_strength: str
    status: str
    created_at: datetime


# --- Scenario & Simulation Schemas ---
class ScenarioCreate(BaseModel):
    name: str = Field(..., description="Scenario Name")
    change_type: str = Field(..., description="REDUCE_DURATION or REMOVE_ACTIVITY")
    target: str = Field(..., description="Target transition or activity")
    parameter_val: float = Field(..., description="Reduction percentage (e.g. 30.0)")
    assumptions: Optional[Dict[str, bool]] = Field(
        default_factory=lambda: {
            "demand_unchanged": True,
            "routing_unchanged": True,
            "exception_unchanged": True
        }
    )

class ScenarioValidateResponse(BaseModel):
    valid: bool
    reason: Optional[str] = None
    target_exists: bool
    required_metrics_available: bool
    sample_sufficient: bool

class SimulationMetricComparison(BaseModel):
    median_cycle_time_hours: float
    sla_violation_pct: float
    p90_cycle_time_hours: float

class SimulationDelta(BaseModel):
    cycle_time_hours: float
    cycle_time_pct: float
    sla_violation_pct_delta: float

class SimulationResultResponse(BaseModel):
    id: str
    scenario_id: str
    analysis_id: str
    current: SimulationMetricComparison
    scenario: SimulationMetricComparison
    change: SimulationDelta
    evidence_strength: str
    assumptions: List[str]
    limitations: List[str]
    calculation_details: Dict[str, Any]


# --- AI Analyst Schemas ---
class AIAskRequest(BaseModel):
    question: str = Field(..., description="Question for AI Analyst")
    finding_ids: Optional[List[str]] = Field(default_factory=list)
    file_context: Optional[str] = Field(None, description="Optional text content or summary of attached file")
    file_name: Optional[str] = Field(None, description="Optional attached file name")

class AIAskStructuredData(BaseModel):
    answer_type: Optional[str] = "DIAGNOSIS"
    summary: str
    answer: Optional[str] = None
    facts: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    interpretations: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    hypotheses: List[Any] = Field(default_factory=list)
    recommendations: List[Any] = Field(default_factory=list)
    limitations: Optional[List[str]] = Field(default_factory=list)
    follow_up_questions: Optional[List[str]] = Field(default_factory=list)
    uncertainty: Optional[str] = None
    prompt_version: Optional[str] = "pio-ai-v0.2.0"
    validation_status: Optional[str] = "VALIDATED"

class AIAskResponse(BaseModel):
    data: AIAskStructuredData
