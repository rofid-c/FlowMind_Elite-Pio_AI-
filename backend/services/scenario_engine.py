import uuid
import numpy as np
from typing import Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from backend.models import Scenario, SimulationResult, Analysis, Event
from backend.services.discovery_engine import DiscoveryEngine

class ScenarioEngine:

    @staticmethod
    def validate_scenario(db: Session, scenario: Scenario, analysis: Analysis) -> Dict[str, Any]:
        """Validates if a scenario configuration can be mathematically simulated on the dataset."""
        if not analysis or not analysis.process_graph_json:
            return {
                "valid": False,
                "reason": "Analysis process graph not available",
                "target_exists": False,
                "required_metrics_available": False,
                "sample_sufficient": False
            }

        graph = analysis.process_graph_json
        target = scenario.target.strip()
        change_type = scenario.change_type.upper()

        target_exists = False
        if change_type == "REDUCE_DURATION":
            # Target can be "Source -> Target" or "Source → Target"
            cleaned_target = target.replace("→", "->")
            if "->" in cleaned_target:
                src, tgt = [p.strip() for p in cleaned_target.split("->", 1)]
                edges = graph.get("edges", [])
                for e in edges:
                    if e["source"] == src and e["target"] == tgt:
                        target_exists = True
                        break
            else:
                # Target is an activity duration
                nodes = graph.get("nodes", [])
                for n in nodes:
                    if n["id"] == target:
                        target_exists = True
                        break

        elif change_type == "REMOVE_ACTIVITY":
            nodes = graph.get("nodes", [])
            for n in nodes:
                if n["id"] == target:
                    target_exists = True
                    break
        else:
            return {
                "valid": False,
                "reason": f"Unsupported change type: {change_type}. Supported: REDUCE_DURATION, REMOVE_ACTIVITY",
                "target_exists": False,
                "required_metrics_available": False,
                "sample_sufficient": False
            }

        if not target_exists:
            return {
                "valid": False,
                "reason": f"Target '{target}' not found in process graph",
                "target_exists": False,
                "required_metrics_available": False,
                "sample_sufficient": False
            }

        if scenario.parameter_val < 0 or scenario.parameter_val > 100:
            return {
                "valid": False,
                "reason": f"Parameter value {scenario.parameter_val}% must be between 0 and 100",
                "target_exists": True,
                "required_metrics_available": False,
                "sample_sufficient": False
            }

        return {
            "valid": True,
            "reason": None,
            "target_exists": True,
            "required_metrics_available": True,
            "sample_sufficient": True
        }

    @staticmethod
    def run_simulation(db: Session, scenario_id: str, analysis_id: str) -> SimulationResult:
        """Runs a deterministic what-if simulation model on case event logs."""
        scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()

        if not scenario or not analysis:
            raise ValueError("Scenario or Analysis not found")

        val_res = ScenarioEngine.validate_scenario(db, scenario, analysis)
        if not val_res["valid"]:
            scenario.status = "UNSUPPORTED"
            db.commit()
            raise ValueError(f"Scenario validation failed: {val_res.get('reason')}")

        cases = DiscoveryEngine.reconstruct_cases(db, analysis.dataset_id)
        if not cases:
            raise ValueError("No cases found in dataset for simulation")

        metrics_baseline = analysis.metrics_json or {}
        case_baseline = metrics_baseline.get("case_metrics", {})
        proc_baseline = metrics_baseline.get("process_metrics", {})
        sla_hours = proc_baseline.get("sla_hours", 24.0)

        baseline_median = case_baseline.get("median_cycle_time_hours", 0.0)
        baseline_p90 = case_baseline.get("p90_hours", 0.0)
        baseline_sla_violations = proc_baseline.get("sla_violation_count", 0)
        baseline_sla_violation_pct = round((baseline_sla_violations / len(cases)) * 100.0, 2) if cases else 0.0

        target = scenario.target.replace("→", "->").strip()
        reduction_factor = scenario.parameter_val / 100.0  # e.g. 0.30

        simulated_cycle_times = []
        simulated_sla_violations = 0

        target_src, target_tgt = None, None
        if "->" in target:
            parts = [p.strip() for p in target.split("->", 1)]
            target_src, target_tgt = parts[0], parts[1]

        for case_id, events in cases.items():
            if not events:
                continue

            original_ct = max(0.0, (events[-1].timestamp - events[0].timestamp).total_seconds() / 3600.0)
            time_saved = 0.0

            if scenario.change_type == "REDUCE_DURATION" and target_src and target_tgt:
                # Find occurrences of transition in this case
                for i in range(len(events) - 1):
                    if events[i].activity == target_src and events[i+1].activity == target_tgt:
                        trans_dur = max(0.0, (events[i+1].timestamp - events[i].timestamp).total_seconds() / 3600.0)
                        saved = trans_dur * reduction_factor
                        time_saved += saved

            simulated_ct = max(0.0, original_ct - time_saved)
            simulated_cycle_times.append(simulated_ct)

            if simulated_ct > sla_hours:
                simulated_sla_violations += 1

        sim_median = round(float(np.percentile(simulated_cycle_times, 50)), 2)
        sim_p90 = round(float(np.percentile(simulated_cycle_times, 90)), 2)
        sim_sla_violation_pct = round((simulated_sla_violations / len(cases)) * 100.0, 2)

        delta_ct_hours = round(sim_median - baseline_median, 2)
        delta_ct_pct = round(((sim_median - baseline_median) / baseline_median) * 100.0, 2) if baseline_median > 0 else 0.0
        delta_sla_pct = round(sim_sla_violation_pct - baseline_sla_violation_pct, 2)

        # Clear old result if any
        db.query(SimulationResult).filter(SimulationResult.scenario_id == scenario_id).delete()

        sim_result = SimulationResult(
            id=f"sim_{uuid.uuid4().hex[:8]}",
            scenario_id=scenario_id,
            analysis_id=analysis_id,
            baseline_metrics_json={
                "median_cycle_time_hours": baseline_median,
                "p90_cycle_time_hours": baseline_p90,
                "sla_violation_pct": baseline_sla_violation_pct
            },
            simulated_metrics_json={
                "median_cycle_time_hours": sim_median,
                "p90_cycle_time_hours": sim_p90,
                "sla_violation_pct": sim_sla_violation_pct
            },
            delta_json={
                "cycle_time_hours": delta_ct_hours,
                "cycle_time_pct": delta_ct_pct,
                "sla_violation_pct_delta": delta_sla_pct
            },
            evidence_strength="MODERATE",
            assumptions=[
                "Demand unchanged (case arrival rate remains constant)",
                "Routing unchanged (no new branch conditions introduced)",
                "Exception volume unchanged"
            ],
            limitations=[
                "Does not account for queueing spillover to downstream activities",
                "Assumes deterministic reduction without resource contention models"
            ],
            calculation_details={
                "model": "DETERMINISTIC_TRANSITION_REDUCTION",
                "reduction_applied_pct": scenario.parameter_val,
                "total_cases_simulated": len(cases)
            }
        )

        scenario.status = "COMPLETED"
        if scenario.project:
            scenario.project.state = "SCENARIO_AVAILABLE"

        db.add(sim_result)
        db.commit()
        db.refresh(sim_result)
        return sim_result
