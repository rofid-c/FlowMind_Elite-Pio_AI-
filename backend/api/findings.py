from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Finding

router = APIRouter(prefix="/findings", tags=["Findings"])

@router.get("/{finding_id}")
def get_finding(finding_id: str, db: Session = Depends(get_db)):
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    return {
        "id": finding.id,
        "project_id": finding.project_id,
        "analysis_id": finding.analysis_id,
        "type": finding.type,
        "title": finding.title,
        "severity": finding.severity,
        "what_observed": finding.what_observed,
        "evidence": finding.evidence_json or {},
        "why_flagged": finding.why_flagged,
        "potential_causes": finding.potential_causes_json or [],
        "recommendations": finding.recommendations_json or [],
        "evidence_strength": finding.evidence_strength,
        "status": finding.status,
        "created_at": finding.created_at
    }

@router.get("/{finding_id}/evidence")
def get_finding_evidence(finding_id: str, db: Session = Depends(get_db)):
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    return {
        "finding_id": finding.id,
        "evidence": finding.evidence_json or {},
        "evidence_strength": finding.evidence_strength
    }

@router.get("/{finding_id}/recommendations")
def get_finding_recommendations(finding_id: str, db: Session = Depends(get_db)):
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    return {
        "finding_id": finding.id,
        "recommendations": finding.recommendations_json or []
    }
