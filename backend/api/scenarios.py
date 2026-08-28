from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Scenario, SimulationResult, Analysis
from backend.schemas import (
    ScenarioValidateResponse, SimulationResultResponse
)
from backend.services.scenario_engine import ScenarioEngine

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])

@router.get("/{scenario_id}")
def get_scenario(scenario_id: str, db: Session = Depends(get_db)):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {
        "id": scenario.id,
        "project_id": scenario.project_id,
        "name": scenario.name,
        "change_type": scenario.change_type,
        "target": scenario.target,
        "parameter_val": scenario.parameter_val,
        "assumptions": scenario.assumptions_json or {},
        "status": scenario.status,
        "created_at": scenario.created_at
    }

@router.post("/{scenario_id}/validate", response_model=ScenarioValidateResponse)
def validate_scenario(
    scenario_id: str,
    analysis_id: str = Query(..., description="ID of baseline analysis to validate against"),
    db: Session = Depends(get_db)
):
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    res = ScenarioEngine.validate_scenario(db, scenario, analysis)
    return res

@router.post("/{scenario_id}/simulate")
def simulate_scenario(
    scenario_id: str,
    analysis_id: str = Query(..., description="ID of baseline analysis to run simulation on"),
    db: Session = Depends(get_db)
):
    try:
        sim_res = ScenarioEngine.run_simulation(db, scenario_id, analysis_id)
        return {
            "data": {
                "id": sim_res.id,
                "scenario_id": sim_res.scenario_id,
                "analysis_id": sim_res.analysis_id,
                "current": sim_res.baseline_metrics_json,
                "scenario": sim_res.simulated_metrics_json,
                "change": sim_res.delta_json,
                "evidence_strength": sim_res.evidence_strength,
                "assumptions": sim_res.assumptions,
                "limitations": sim_res.limitations,
                "calculation_details": sim_res.calculation_details,
                "created_at": sim_res.created_at
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{scenario_id}/results")
def get_scenario_results(scenario_id: str, db: Session = Depends(get_db)):
    sim_res = db.query(SimulationResult).filter(SimulationResult.scenario_id == scenario_id).first()
    if not sim_res:
        raise HTTPException(status_code=404, detail="Simulation results not found for this scenario. Run simulation first.")

    return {
        "data": {
            "id": sim_res.id,
            "scenario_id": sim_res.scenario_id,
            "analysis_id": sim_res.analysis_id,
            "current": sim_res.baseline_metrics_json,
            "scenario": sim_res.simulated_metrics_json,
            "change": sim_res.delta_json,
            "evidence_strength": sim_res.evidence_strength,
            "assumptions": sim_res.assumptions,
            "limitations": sim_res.limitations,
            "calculation_details": sim_res.calculation_details,
            "created_at": sim_res.created_at
        }
    }
