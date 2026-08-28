from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.models import Project, Scenario, Finding
from backend.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    AIAskRequest, AIAskResponse,
    ScenarioCreate,
    FindingResponse
)
from backend.services.ai_analyst_engine import AIAnalystEngine

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(
        name=payload.name,
        process_name=payload.process_name,
        description=payload.description,
        state="EMPTY"
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.get("", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.created_at.desc()).all()

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, payload: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if payload.name is not None:
        project.name = payload.name
    if payload.process_name is not None:
        project.process_name = payload.process_name
    if payload.description is not None:
        project.description = payload.description
    if payload.state is not None:
        project.state = payload.state

    db.commit()
    db.refresh(project)
    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    return None

# Section 37: AI API
@router.post("/{project_id}/ai/ask", response_model=AIAskResponse)
def ask_ai(project_id: str, payload: AIAskRequest, db: Session = Depends(get_db)):
    result = AIAnalystEngine.ask_ai(
        db, project_id, payload.question, payload.finding_ids,
        file_context=payload.file_context, file_name=payload.file_name
    )
    return {"data": result}

# Section 35: Project Findings
@router.get("/{project_id}/findings")
def get_project_findings(project_id: str, db: Session = Depends(get_db)):
    findings = db.query(Finding).filter(Finding.project_id == project_id).all()
    res = []
    for f in findings:
        res.append({
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
        })
    return res

# Section 36: Project Scenarios
@router.post("/{project_id}/scenarios", status_code=status.HTTP_201_CREATED)
def create_scenario(project_id: str, payload: ScenarioCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    scenario = Scenario(
        project_id=project_id,
        name=payload.name,
        change_type=payload.change_type,
        target=payload.target,
        parameter_val=payload.parameter_val,
        assumptions_json=payload.assumptions or {},
        status="DRAFT"
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return {
        "id": scenario.id,
        "project_id": scenario.project_id,
        "name": scenario.name,
        "change_type": scenario.change_type,
        "target": scenario.target,
        "parameter_val": scenario.parameter_val,
        "assumptions": scenario.assumptions_json,
        "status": scenario.status,
        "created_at": scenario.created_at
    }

@router.get("/{project_id}/scenarios")
def list_project_scenarios(project_id: str, db: Session = Depends(get_db)):
    scenarios = db.query(Scenario).filter(Scenario.project_id == project_id).all()
    return [
        {
            "id": s.id,
            "project_id": s.project_id,
            "name": s.name,
            "change_type": s.change_type,
            "target": s.target,
            "parameter_val": s.parameter_val,
            "status": s.status,
            "created_at": s.created_at
        }
        for s in scenarios
    ]
