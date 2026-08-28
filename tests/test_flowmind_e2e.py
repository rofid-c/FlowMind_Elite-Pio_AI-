import os
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import Base, engine

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    # Cleanup


def test_full_flowmind_lifecycle():
    # 1. Step 1: Create Project (Section 31)
    proj_resp = client.post("/api/v1/projects", json={
        "name": "Customer Complaint Analysis",
        "process_name": "Customer Complaint Resolution",
        "description": "Analysis of complaint handling process."
    })
    assert proj_resp.status_code == 201
    proj_data = proj_resp.json()
    project_id = proj_data["id"]
    assert proj_data["state"] == "EMPTY"
    assert proj_data["name"] == "Customer Complaint Analysis"

    # 2. Step 2: Upload Dataset (Section 32)
    golden_csv_path = os.path.join(os.path.dirname(__file__), "..", "data", "golden_small.csv")
    assert os.path.exists(golden_csv_path)

    with open(golden_csv_path, "rb") as f:
        upload_resp = client.post(
            f"/api/v1/projects/{project_id}/datasets",
            files={"file": ("golden_small.csv", f, "text/csv")}
        )
    assert upload_resp.status_code == 201
    upload_json = upload_resp.json()["data"]
    dataset_id = upload_json["id"]
    assert upload_json["status"] == "UPLOADED"
    assert "ticket_id" in upload_json["detected_columns"]
    assert "status" in upload_json["detected_columns"]
    assert "created_at" in upload_json["detected_columns"]

    # 3. Step 3: Column Mapping (Section 33)
    map_resp = client.post(f"/api/v1/datasets/{dataset_id}/mapping", json={
        "case_id": "ticket_id",
        "activity": "status",
        "timestamp": "created_at",
        "actor": "assigned_to",
        "department": "department"
    })
    assert map_resp.status_code == 200
    map_data = map_resp.json()
    assert map_data["case_id_col"] == "ticket_id"
    assert map_data["activity_col"] == "status"

    # 4. Step 4: Preview & Data Quality (Section 33, Epic 2)
    preview_resp = client.post(f"/api/v1/datasets/{dataset_id}/preview")
    assert preview_resp.status_code == 200
    preview_data = preview_resp.json()
    assert preview_data["rows"] == 27
    assert preview_data["unique_cases"] == 5
    assert preview_data["unique_activities"] == 6  # Submit Ticket, Review, Request Info, Approve, Resolve, Close
    assert preview_data["quality_score"] == 100.0
    assert preview_data["missing_values"]["case_id"] == 0.0

    # 5. Step 5: Confirm & Ingest
    confirm_resp = client.post(f"/api/v1/datasets/{dataset_id}/confirm")
    assert confirm_resp.status_code == 200
    confirm_data = confirm_resp.json()
    assert confirm_data["status"] == "READY"
    assert confirm_data["case_count"] == 5

    # Check project state updated to DATASET_ADDED
    get_proj = client.get(f"/api/v1/projects/{project_id}").json()
    assert get_proj["state"] == "DATASET_ADDED"

    # 6. Step 6: Run Analysis Pipeline (Section 34)
    analysis_resp = client.post(f"/api/v1/datasets/{dataset_id}/analyses", json={
        "sla_hours": 24.0
    })
    assert analysis_resp.status_code == 201
    analysis_info = analysis_resp.json()["data"]
    analysis_id = analysis_info["analysis_id"]
    assert analysis_info["status"] == "COMPLETED"

    # 7. Verify Polling Endpoint
    status_resp = client.get(f"/api/v1/analyses/{analysis_id}")
    assert status_resp.status_code == 200
    assert status_resp.json()["data"]["progress"] == 100
    assert status_resp.json()["data"]["status"] == "COMPLETED"

    # 8. Check Analysis Summary
    summary_resp = client.get(f"/api/v1/analyses/{analysis_id}/summary")
    assert summary_resp.status_code == 200
    summary_data = summary_resp.json()["data"]
    assert summary_data["case_count"] == 5
    assert summary_data["total_variants"] == 2
    assert summary_data["median_cycle_time_hours"] == 10.0  # C001=9h, C004=9.5h, C002=10h, C003=14h, C005=35h -> Median = 10.0h
    assert summary_data["sla_compliance_pct"] == 80.0  # 4 out of 5 under 24h SLA

    # 9. Check Process Graph (DFG)
    graph_resp = client.get(f"/api/v1/analyses/{analysis_id}/process-graph")
    assert graph_resp.status_code == 200
    graph = graph_resp.json()
    assert len(graph["nodes"]) == 6
    # Check start & end nodes
    submit_node = next(n for n in graph["nodes"] if n["id"] == "Submit Ticket")
    close_node = next(n for n in graph["nodes"] if n["id"] == "Close")
    assert submit_node["is_start"] is True
    assert close_node["is_end"] is True

    # Check Review -> Approve edge (Bottleneck transition)
    rev_app_edge = next(e for e in graph["edges"] if e["source"] == "Review" and e["target"] == "Approve")
    assert rev_app_edge["frequency"] == 5
    assert rev_app_edge["median_elapsed_hours"] == 5.5

    # 10. Check Metrics
    metrics_resp = client.get(f"/api/v1/analyses/{analysis_id}/metrics")
    assert metrics_resp.status_code == 200
    metrics = metrics_resp.json()
    assert metrics["case_metrics"]["p50_hours"] == 10.0
    assert metrics["case_metrics"]["min_cycle_time_hours"] == 9.0
    assert metrics["case_metrics"]["max_cycle_time_hours"] == 35.0
    assert metrics["process_metrics"]["rework_rate_pct"] == 20.0  # C003 had rework (Review -> Request Info -> Review)
    assert metrics["process_metrics"]["sla_violation_count"] == 1

    # 11. Check Variants
    variants_resp = client.get(f"/api/v1/analyses/{analysis_id}/variants")
    assert variants_resp.status_code == 200
    variants_data = variants_resp.json()
    assert variants_data["total_variants"] == 2
    assert variants_data["variants"][0]["rank"] == 1
    assert variants_data["variants"][0]["cases"] == 4
    assert variants_data["variants"][0]["share_pct"] == 80.0

    # 12. Check Findings Engine Output (Epic 5)
    findings_resp = client.get(f"/api/v1/analyses/{analysis_id}/findings")
    assert findings_resp.status_code == 200
    findings = findings_resp.json()
    assert len(findings) >= 3  # Bottleneck, Rework, SLA Violation
    
    finding_types = [f["type"] for f in findings]
    assert "BOTTLENECK" in finding_types
    assert "REWORK" in finding_types
    assert "SLA_VIOLATION" in finding_types

    # 13. Check Finding Detail & Evidence endpoints
    first_finding = findings[0]
    finding_id = first_finding["id"]
    evidence_resp = client.get(f"/api/v1/findings/{finding_id}/evidence")
    assert evidence_resp.status_code == 200
    assert "evidence" in evidence_resp.json()

    # 14. Check Scenario & Simulation Engine (Epic 8)
    scen_resp = client.post(f"/api/v1/projects/{project_id}/scenarios", json={
        "name": "Reduce approval delay by 30%",
        "change_type": "REDUCE_DURATION",
        "target": "Review -> Approve",
        "parameter_val": 30.0
    })
    assert scen_resp.status_code == 201
    scen_data = scen_resp.json()
    scen_id = scen_data["id"]

    # Validate Scenario
    val_resp = client.post(f"/api/v1/scenarios/{scen_id}/validate?analysis_id={analysis_id}")
    assert val_resp.status_code == 200
    assert val_resp.json()["valid"] is True

    # Run Simulation
    sim_resp = client.post(f"/api/v1/scenarios/{scen_id}/simulate?analysis_id={analysis_id}")
    assert sim_resp.status_code == 200
    sim_data = sim_resp.json()["data"]
    assert sim_data["scenario_id"] == scen_id
    assert sim_data["current"]["median_cycle_time_hours"] == 10.0
    assert sim_data["change"]["cycle_time_hours"] < 0  # Cycle time decreased!
    assert sim_data["evidence_strength"] == "MODERATE"

    # 15. Check AI Analyst with Intent & Context Selection (Epic 7)
    ai_resp_1 = client.post(f"/api/v1/projects/{project_id}/ai/ask", json={
        "question": "Why is this process slow?"
    })
    assert ai_resp_1.status_code == 200
    ai_data_1 = ai_resp_1.json()["data"]
    assert len(ai_data_1["summary"]) > 10
    assert len(ai_data_1["evidence"]) > 0
    assert len(ai_data_1["recommendations"]) > 0

    ai_resp_2 = client.post(f"/api/v1/projects/{project_id}/ai/ask", json={
        "question": "What explains the SLA violations?"
    })
    assert ai_resp_2.status_code == 200
    ai_data_2 = ai_resp_2.json()["data"]
    assert "SLA" in ai_data_2["summary"]
    assert "uncertainty" in ai_data_2
