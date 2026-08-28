import os
import sys
import time

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from backend.database import Base, engine, SessionLocal
from backend.models import Project, Dataset, DatasetMapping, Analysis, Scenario
from backend.services.ingestion_engine import IngestionEngine
from backend.services.discovery_engine import DiscoveryEngine
from backend.services.analytics_engine import AnalyticsEngine
from backend.services.findings_engine import FindingsEngine
from backend.services.scenario_engine import ScenarioEngine
from backend.services.ai_analyst_engine import AIAnalystEngine

def run_test():
    print("=== 1. Testing Ingestion Quality on 10,000 Cases Dataset ===")
    file_path = "flowmind_customer_complaint_complex_10000.csv"
    if not os.path.exists(file_path):
        print("File not found!")
        return

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    class MockMapping:
        case_id_col = "case_id"
        activity_col = "activity"
        timestamp_col = "timestamp"
        actor_col = "actor"
        department_col = "department"
        custom_attributes = {"complaint_category": "complaint_category", "priority": "priority"}

    t0 = time.time()
    eval_res = IngestionEngine.evaluate_data_quality(file_path, MockMapping())
    print(f"Data Quality Evaluation ({round(time.time() - t0, 2)}s):")
    print(f"- Total Rows: {eval_res['rows']:,}")
    print(f"- Unique Cases: {eval_res['unique_cases']:,}")
    print(f"- Unique Activities: {eval_res['unique_activities']}")
    print(f"- Data Quality Score: {eval_res['quality_score']}%")
    print(f"- Missing Timestamps: {eval_res['missing_values'].get('timestamp', 0)}%")
    print(f"- Duplicate Events Rate: {eval_res['potential_duplicates']}%")

    print("\n=== 2. Ingesting & Normalizing into Database ===")
    proj = Project(name="Customer Complaint 10K", process_name="Customer Complaint Resolution")
    db.add(proj)
    db.commit()

    ds = Dataset(project_id=proj.id, filename="flowmind_customer_complaint_complex_10000.csv", file_path=file_path, status="UPLOADED")
    db.add(ds)
    db.commit()

    mapping = DatasetMapping(
        dataset_id=ds.id,
        case_id_col="case_id",
        activity_col="activity",
        timestamp_col="timestamp",
        actor_col="actor",
        department_col="department",
        custom_attributes={"priority": "priority", "channel": "channel"}
    )
    db.add(mapping)
    db.commit()

    t0 = time.time()
    IngestionEngine.persist_normalized_events(db, ds.id)
    print(f"Normalized persistence completed in {round(time.time() - t0, 2)}s. Stored {ds.row_count:,} events.")

    print("\n=== 3. Process Discovery (Case Reconstruction & DFG) ===")
    t0 = time.time()
    cases = DiscoveryEngine.reconstruct_cases(db, ds.id)
    print(f"Reconstructed {len(cases):,} cases in {round(time.time() - t0, 2)}s.")
    
    graph = DiscoveryEngine.extract_process_graph(cases)
    print(f"- DFG Graph Nodes: {len(graph['nodes'])} activities")
    print(f"- DFG Graph Transitions: {len(graph['edges'])} edges")
    
    variants = DiscoveryEngine.extract_variants(cases)
    print(f"- Unique Variants: {len(variants)} variants discovered")
    if variants:
        top_v = variants[0]
        print(f"  * Top Variant #1: {top_v['cases']} cases ({top_v['share_pct']}%), Median Cycle: {top_v['median_cycle_hours']}h")
        print(f"    Path: {top_v['variant']}")

    print("\n=== 4. Analytics & SLA Calculations ===")
    metrics = AnalyticsEngine.compute_metrics(cases, sla_hours=72.0)
    cm = metrics["case_metrics"]
    pm = metrics["process_metrics"]
    print(f"- Median Cycle Time (P50): {cm['p50_hours']}h")
    print(f"- P75 Cycle Time: {cm['p75_hours']}h")
    print(f"- P90 Cycle Time: {cm['p90_hours']}h")
    print(f"- Mean Cycle Time: {cm['mean_cycle_time_hours']}h")
    print(f"- Rework Rate: {pm['rework_rate_pct']}% of cases")
    print(f"- SLA Compliance (72h target): {pm['sla_compliance_pct']}% ({pm['sla_violation_count']:,} violations)")

    print("\n=== 5. Deterministic Findings Engine ===")
    analysis = Analysis(
        dataset_id=ds.id,
        status="COMPLETED",
        stage="FINALIZATION",
        progress=100,
        metrics_json=metrics,
        variants_json=variants,
        process_graph_json=graph
    )
    db.add(analysis)
    db.commit()

    findings = FindingsEngine.generate_findings(db, proj.id, analysis.id, metrics, variants, graph)
    print(f"Generated {len(findings)} findings:")
    for f in findings:
        print(f"  * [{f.severity}] {f.title}")
        print(f"    Observation: {f.what_observed}")

    print("\n=== 6. What-If Simulation Engine ===")
    # Pick top transition from transition metrics
    top_trans = metrics["transition_metrics"][0]
    target_pair = f"{top_trans['source']} -> {top_trans['target']}"
    scen = Scenario(
        project_id=proj.id,
        name=f"Reduce {target_pair} delay by 30%",
        change_type="REDUCE_DURATION",
        target=target_pair,
        parameter_val=30.0,
        status="DRAFT"
    )
    db.add(scen)
    db.commit()

    sim_res = ScenarioEngine.run_simulation(db, scen.id, analysis.id)
    print(f"Simulated Scenario: {scen.name}")
    print(f"- Baseline Median Cycle Time: {sim_res.baseline_metrics_json['median_cycle_time_hours']}h")
    print(f"- Simulated Median Cycle Time: {sim_res.simulated_metrics_json['median_cycle_time_hours']}h")
    print(f"- Time Saved: {sim_res.delta_json['cycle_time_hours']}h ({sim_res.delta_json['cycle_time_pct']}%)")

    print("\n=== 7. AI Analyst Context Selection ===")
    ai_q1 = AIAnalystEngine.ask_ai(db, proj.id, "Why is this process slow?")
    print(f"Q: Why is this process slow?")
    print(f"A: {ai_q1['summary']}")
    print(f"   Evidence: {ai_q1['evidence']}")

    print("\n========================================================")
    print(">>> 100% SUKSES! DATASET 10.000 KASUS SELESAI DIUJI <<<")
    print("========================================================")
    db.close()

if __name__ == "__main__":
    run_test()
