from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class EvidenceItem(BaseModel):
    """Ground truth metric / fact from deterministic engine with distinct EV-xxx identifier."""
    id: str = Field(..., description="Unique evidence ID (e.g. EV-001)")
    metric: str = Field(..., description="Name of the observed metric or process property")
    value: Any = Field(..., description="Authoritative numeric value or description")
    dataset: Optional[str] = Field(None, description="Dataset name or source scope")
    details: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional context/metadata")

class FactStatement(BaseModel):
    """Direct factual statement directly mapped to one or more Evidence IDs."""
    text: str
    evidence_ids: List[str] = Field(default_factory=list)

class InterpretationStatement(BaseModel):
    """Business interpretation explaining what the facts mean in operational context."""
    text: str
    evidence_ids: List[str] = Field(default_factory=list)

class HypothesisStatement(BaseModel):
    """Unproven candidate root-cause or operational factor requiring further investigation."""
    text: str
    evidence_ids: List[str] = Field(default_factory=list)

class RecommendationStatement(BaseModel):
    """Conservative, actionable next step (investigate, evaluate, standardize, monitor)."""
    text: str
    action_type: Optional[str] = Field("INVESTIGATE", description="INVESTIGATE | EVALUATE | STANDARDIZE | MONITOR | AUTOMATE")
    evidence_ids: List[str] = Field(default_factory=list)

class AIAnswerObject(BaseModel):
    """Canonical Pio_AI Structured Answer Contract (PRD v1 & Grounded v0.2)."""
    answer_type: str = Field("DIAGNOSIS", description="FACT_LOOKUP | PROCESS_ANALYSIS | COMPARISON | DIAGNOSIS | RECOMMENDATION | SCENARIO | VARIANT_ANALYSIS")
    summary: str = Field(..., description="Direct 2-3 sentence executive answer in Bahasa Indonesia")
    answer: Optional[str] = Field(None, description="PRD v1 alias for summary")
    evidence: List[EvidenceItem] = Field(default_factory=list)
    facts: List[FactStatement] = Field(default_factory=list)
    interpretations: List[InterpretationStatement] = Field(default_factory=list)
    hypotheses: List[HypothesisStatement] = Field(default_factory=list)
    possible_causes: List[str] = Field(default_factory=list, description="PRD v1 list of possible causes")
    recommendations: List[RecommendationStatement] = Field(default_factory=list)
    recommendation: Optional[str] = Field(None, description="PRD v1 primary recommendation")
    limitations: List[str] = Field(default_factory=list)
    uncertainty: Optional[str] = Field(None, description="PRD v1 uncertainty / limitation notice")
    follow_up_questions: List[str] = Field(default_factory=list)
    prompt_version: str = Field("pio-ai-v1.0")
    validation_status: str = Field("VALIDATED")
