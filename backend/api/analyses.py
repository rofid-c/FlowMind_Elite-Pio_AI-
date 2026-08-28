from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Dataset, Analysis, Event, Finding, Project
from backend.schemas import (
    AnalysisCreate, AnalysisStatusResponse,
    ProcessGraphResponse, MetricsResponse, VariantsResponse,
    FindingResponse
)
from backend.services.ingestion_engine import IngestionEngine
from backend.services.discovery_engine import DiscoveryEngine
from backend.services.analytics_engine import AnalyticsEngine
from backend.services.findings_engine import FindingsEngine
from backend.config import settings

router = APIRouter(tags=["Analyses"])

def run_analysis_pipeline(db: Session, analysis: Analysis, sla_hours: float = 24.0):
    """Executes the vertical analysis pipeline across all calculation engines."""
    dataset = analysis.dataset
    if not dataset:
        raise ValueError("Dataset not found")

    # If dataset events haven't been persisted yet, persist them now
    event_count = db.query(Event).filter(Event.dataset_id == dataset.id).count()
    if event_count == 0:
        analysis.stage = "INGESTION"
        analysis.progress = 15
        db.commit()
        IngestionEngine.persist_normalized_events(db, dataset.id)

    # 1. Reconstruction (20-45%)
    analysis.stage = "RECONSTRUCTION"
    analysis.progress = 30
    db.commit()
    cases = DiscoveryEngine.reconstruct_cases(db, dataset.id)

    # 2. Process Discovery (45-65%)
    analysis.stage = "PROCESS_DISCOVERY"
    analysis.progress = 55
    db.commit()
    process_graph = DiscoveryEngine.extract_process_graph(cases)
    variants = DiscoveryEngine.extract_variants(cases)

    # 3. Metrics Calculation (65-80%)
    analysis.stage = "METRICS"
    analysis.progress = 75
    db.commit()
    metrics = AnalyticsEngine.compute_metrics(cases, sla_hours=sla_hours)

    # 4. Findings Engine (80-90%)
    analysis.stage = "FINDINGS"
    analysis.progress = 85
    db.commit()
    findings = FindingsEngine.generate_findings(
        db=db,
        project_id=dataset.project_id,
        analysis_id=analysis.id,
        metrics=metrics,
        variants=variants,
        process_graph=process_graph
    )

    # 5. Finalization (90-100%)
    analysis.stage = "FINALIZATION"
    analysis.progress = 100
    analysis.status = "COMPLETED"
    analysis.completed_at = datetime.utcnow()

    # Store JSON representations
    analysis.process_graph_json = process_graph
    analysis.variants_json = variants
    analysis.metrics_json = metrics

    case_m = metrics.get("case_metrics", {})
    proc_m = metrics.get("process_metrics", {})
    analysis.summary_json = {
        "case_count": case_m.get("case_count", 0),
        "total_variants": proc_m.get("total_variants", 0),
        "median_cycle_time_hours": case_m.get("median_cycle_time_hours", 0.0),
        "sla_compliance_pct": proc_m.get("sla_compliance_pct", 100.0),
        "rework_rate_pct": proc_m.get("rework_rate_pct", 0.0),
        "total_findings_count": len(findings)
    }

    # Update project state to ANALYZED / INSIGHTS_AVAILABLE
    if dataset.project:
        dataset.project.state = "INSIGHTS_AVAILABLE"

    db.commit()
    db.refresh(analysis)
    return analysis


# Section 34: Analysis API
@router.post("/datasets/{dataset_id}/analyses", status_code=status.HTTP_201_CREATED)
def trigger_analysis(
    dataset_id: str,
    payload: AnalysisCreate = AnalysisCreate(),
    db: Session = Depends(get_db)
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not dataset.mapping:
        raise HTTPException(status_code=400, detail="Cannot run analysis without dataset column mapping.")

    analysis = Analysis(
        dataset_id=dataset_id,
        engine_version=settings.ENGINE_VERSION,
        status="PROCESSING",
        stage="INGESTION",
        progress=10,
        configuration=payload.configuration or {"sla_hours": payload.sla_hours}
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    # Run the computation pipeline synchronously
    try:
        run_analysis_pipeline(db, analysis, sla_hours=payload.sla_hours or 24.0)
    except Exception as e:
        analysis.status = "FAILED"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis pipeline error: {str(e)}")

    return {
        "data": {
            "analysis_id": analysis.id,
            "dataset_id": analysis.dataset_id,
            "engine_version": analysis.engine_version,
            "status": analysis.status
        }
    }

@router.get("/analyses/{analysis_id}")
def get_analysis_status(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return {
        "data": {
            "analysis_id": analysis.id,
            "dataset_id": analysis.dataset_id,
            "engine_version": analysis.engine_version,
            "status": analysis.status,
            "stage": analysis.stage,
            "progress": analysis.progress
        }
    }

@router.post("/analyses/{analysis_id}/cancel")
def cancel_analysis(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    analysis.status = "CANCELLED"
    db.commit()
    return {"data": {"analysis_id": analysis.id, "status": "CANCELLED"}}

# Result Resources
@router.get("/analyses/{analysis_id}/summary")
def get_analysis_summary(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis.status != "COMPLETED":
        raise HTTPException(status_code=400, detail=f"Analysis is not completed yet (current status: {analysis.status})")
    return {"data": analysis.summary_json}

@router.get("/analyses/{analysis_id}/process-graph", response_model=ProcessGraphResponse)
def get_process_graph(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if not analysis.process_graph_json:
        raise HTTPException(status_code=400, detail="Process graph data not available")
    return analysis.process_graph_json

@router.get("/analyses/{analysis_id}/metrics", response_model=MetricsResponse)
def get_metrics(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if not analysis.metrics_json:
        raise HTTPException(status_code=400, detail="Metrics data not available")
    return analysis.metrics_json

@router.get("/analyses/{analysis_id}/variants", response_model=VariantsResponse)
def get_variants(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis.variants_json is None:
        raise HTTPException(status_code=400, detail="Variants data not available")
    
    variants = analysis.variants_json
    total_cases = sum(v["cases"] for v in variants) if variants else 0
    return {
        "total_cases": total_cases,
        "total_variants": len(variants),
        "variants": variants
    }

@router.get("/analyses/{analysis_id}/findings")
def get_analysis_findings(analysis_id: str, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    findings = db.query(Finding).filter(Finding.analysis_id == analysis_id).all()
    return [
        {
            "id": f.id,
            "project_id": f.project_id,
            "analysis_id": f.analysis_id,
            "type": f.type,
            "title": f.title,
            "severity": f.severity,
            "what_observed": f.what_observed,
            "evidence": f.evidence_json or {},
            "why_flagged": f.why_flagged,
            "potential_causes": f.potential_causes_json or [],
            "recommendations": f.recommendations_json or [],
            "evidence_strength": f.evidence_strength,
            "status": f.status,
            "created_at": f.created_at
        }
        for f in findings
    ]

@router.get("/projects/{project_id}/latest-analysis")
def get_latest_project_analysis(project_id: str, db: Session = Depends(get_db)):
    analysis = (
        db.query(Analysis)
        .join(Analysis.dataset)
        .filter(Analysis.dataset.has(project_id=project_id), Analysis.status == "COMPLETED")
        .order_by(Analysis.created_at.desc())
        .first()
    )
    if not analysis:
        return {"data": None}
    return {
        "data": {
            "analysis_id": analysis.id,
            "dataset_id": analysis.dataset_id,
            "status": analysis.status,
            "summary": analysis.summary_json,
            "created_at": analysis.created_at
        }
    }

@router.get("/datasets/{dataset_id}/latest-analysis")
def get_latest_dataset_analysis(dataset_id: str, db: Session = Depends(get_db)):
    analysis = (
        db.query(Analysis)
        .filter(Analysis.dataset_id == dataset_id, Analysis.status == "COMPLETED")
        .order_by(Analysis.created_at.desc())
        .first()
    )
    if not analysis:
        return {"data": None}
    return {
        "data": {
            "analysis_id": analysis.id,
            "dataset_id": analysis.dataset_id,
            "status": analysis.status,
            "summary": analysis.summary_json,
            "created_at": analysis.created_at
        }
    }

