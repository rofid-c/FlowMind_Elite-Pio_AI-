import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Tuple
from collections import defaultdict
from sqlalchemy.orm import Session
from backend.models import Event

class DiscoveryEngine:

    @staticmethod
    def reconstruct_cases(db: Session, dataset_id: str) -> Dict[str, List[Event]]:
        """Groups and sorts events by case_id and chronological timestamp."""
        events = db.query(Event).filter(Event.dataset_id == dataset_id).order_by(Event.case_id, Event.timestamp).all()
        cases = defaultdict(list)
        for event in events:
            cases[event.case_id].append(event)
        return dict(cases)

    @staticmethod
    def extract_process_graph(cases: Dict[str, List[Event]]) -> Dict[str, Any]:
        """Builds Directly-Follows Graph (DFG) with nodes and transition metrics."""
        total_cases = len(cases)
        if total_cases == 0:
            return {"nodes": [], "edges": []}

        node_freq = defaultdict(int)
        node_cases = defaultdict(set)
        start_nodes = set()
        end_nodes = set()

        edge_freq = defaultdict(int)
        edge_cases = defaultdict(set)
        edge_durations = defaultdict(list)

        for case_id, events in cases.items():
            if not events:
                continue

            start_nodes.add(events[0].activity)
            end_nodes.add(events[-1].activity)

            for i, event in enumerate(events):
                act = event.activity
                node_freq[act] += 1
                node_cases[act].add(case_id)

                if i < len(events) - 1:
                    next_event = events[i + 1]
                    next_act = next_event.activity
                    transition_key = (act, next_act)
                    
                    edge_freq[transition_key] += 1
                    edge_cases[transition_key].add(case_id)

                    elapsed_hours = max(0.0, (next_event.timestamp - event.timestamp).total_seconds() / 3600.0)
                    edge_durations[transition_key].append(elapsed_hours)

        # Build Nodes
        nodes = []
        for act, freq in sorted(node_freq.items(), key=lambda x: x[1], reverse=True):
            coverage = round((len(node_cases[act]) / total_cases) * 100.0, 2)
            nodes.append({
                "id": act,
                "label": act,
                "frequency": freq,
                "case_coverage_pct": coverage,
                "is_start": act in start_nodes,
                "is_end": act in end_nodes
            })

        # Build Edges
        edges = []
        for (src, tgt), freq in sorted(edge_freq.items(), key=lambda x: x[1], reverse=True):
            durations = edge_durations[(src, tgt)]
            median_d = round(float(np.median(durations)), 2) if durations else 0.0
            p90_d = round(float(np.percentile(durations, 90)), 2) if durations else 0.0
            min_d = round(float(np.min(durations)), 2) if durations else 0.0
            max_d = round(float(np.max(durations)), 2) if durations else 0.0
            coverage = round((len(edge_cases[(src, tgt)]) / total_cases) * 100.0, 2)

            edges.append({
                "source": src,
                "target": tgt,
                "frequency": freq,
                "case_coverage_pct": coverage,
                "median_elapsed_hours": median_d,
                "p90_elapsed_hours": p90_d,
                "min_elapsed_hours": min_d,
                "max_elapsed_hours": max_d
            })

        return {
            "nodes": nodes,
            "edges": edges
        }

    @staticmethod
    def extract_variants(cases: Dict[str, List[Event]]) -> List[Dict[str, Any]]:
        """Extracts unique process paths (variants), ranking by case frequency and median cycle time."""
        total_cases = len(cases)
        if total_cases == 0:
            return []

        variant_cases = defaultdict(list)
        variant_cycle_times = defaultdict(list)

        for case_id, events in cases.items():
            if not events:
                continue

            path_str = " → ".join([e.activity for e in events])
            cycle_time = (events[-1].timestamp - events[0].timestamp).total_seconds() / 3600.0
            
            variant_cases[path_str].append(case_id)
            variant_cycle_times[path_str].append(cycle_time)

        # Sort variants by case count descending
        sorted_variants = sorted(variant_cases.items(), key=lambda x: len(x[1]), reverse=True)

        variants_list = []
        for rank, (var_path, case_ids) in enumerate(sorted_variants, start=1):
            count = len(case_ids)
            share_pct = round((count / total_cases) * 100.0, 2)
            c_times = variant_cycle_times[var_path]
            median_cycle = round(float(np.median(c_times)), 2) if c_times else 0.0
            p90_cycle = round(float(np.percentile(c_times, 90)), 2) if c_times else 0.0

            variants_list.append({
                "rank": rank,
                "variant": var_path,
                "cases": count,
                "share_pct": share_pct,
                "median_cycle_hours": median_cycle,
                "p90_cycle_hours": p90_cycle
            })

        return variants_list
