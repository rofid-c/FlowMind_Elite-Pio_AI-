import numpy as np
import math
from typing import Dict, Any, List
from collections import defaultdict
from backend.models import Event

class AnalyticsEngine:

    @staticmethod
    def compute_metrics(cases: Dict[str, List[Event]], sla_hours: float = 24.0) -> Dict[str, Any]:
        """Calculates comprehensive case, process, transition, and activity metrics."""
        total_cases = len(cases)
        if total_cases == 0:
            return {
                "case_metrics": {
                    "case_count": 0,
                    "median_cycle_time_hours": 0.0,
                    "p50_hours": 0.0,
                    "p75_hours": 0.0,
                    "p90_hours": 0.0,
                    "p95_hours": 0.0,
                    "mean_cycle_time_hours": 0.0,
                    "min_cycle_time_hours": 0.0,
                    "max_cycle_time_hours": 0.0
                },
                "process_metrics": {
                    "total_variants": 0,
                    "rework_rate_pct": 0.0,
                    "sla_hours": sla_hours,
                    "sla_compliance_pct": 100.0,
                    "sla_violation_count": 0
                },
                "transition_metrics": [],
                "activity_metrics": []
            }

        cycle_times = []
        cases_with_rework = 0
        sla_violations = 0

        act_freq = defaultdict(int)
        act_cases = defaultdict(set)

        trans_durations = defaultdict(list)
        trans_freq = defaultdict(int)

        unique_variants = set()

        for case_id, events in cases.items():
            if not events:
                continue

            # Cycle time
            first_ts = events[0].timestamp
            last_ts = events[-1].timestamp
            duration_h = max(0.0, (last_ts - first_ts).total_seconds() / 3600.0)
            cycle_times.append(duration_h)

            # SLA check
            if duration_h > sla_hours:
                sla_violations += 1

            # Rework / Loop check in case
            activities_in_case = [e.activity for e in events]
            if len(activities_in_case) > len(set(activities_in_case)):
                cases_with_rework += 1

            # Variant
            unique_variants.add(" → ".join(activities_in_case))

            # Activities & Transitions
            for i, event in enumerate(events):
                act = event.activity
                act_freq[act] += 1
                act_cases[act].add(case_id)

                if i < len(events) - 1:
                    next_event = events[i + 1]
                    pair = (act, next_event.activity)
                    t_elapsed = max(0.0, (next_event.timestamp - event.timestamp).total_seconds() / 3600.0)
                    trans_durations[pair].append(t_elapsed)
                    trans_freq[pair] += 1

        # Case metrics
        p50 = round(float(np.percentile(cycle_times, 50)), 2)
        p75 = round(float(np.percentile(cycle_times, 75)), 2)
        p90 = round(float(np.percentile(cycle_times, 90)), 2)
        p95 = round(float(np.percentile(cycle_times, 95)), 2)
        mean_ct = round(float(np.mean(cycle_times)), 2)
        min_ct = round(float(np.min(cycle_times)), 2)
        max_ct = round(float(np.max(cycle_times)), 2)

        rework_rate_pct = round((cases_with_rework / total_cases) * 100.0, 2)
        sla_compliance_pct = round(((total_cases - sla_violations) / total_cases) * 100.0, 2)

        # Transition metrics
        transition_metrics = []
        for (src, tgt), durations in trans_durations.items():
            freq = trans_freq[(src, tgt)]
            med_el = round(float(np.median(durations)), 2) if durations else 0.0
            p90_el = round(float(np.percentile(durations, 90)), 2) if durations else 0.0
            
            # Bottleneck score = median_duration * log(1 + frequency)
            bottleneck_score = round(med_el * math.log1p(freq), 2)

            transition_metrics.append({
                "source": src,
                "target": tgt,
                "frequency": freq,
                "median_elapsed_hours": med_el,
                "p90_elapsed_hours": p90_el,
                "bottleneck_score": bottleneck_score
            })

        # Sort transition metrics by bottleneck score descending
        transition_metrics.sort(key=lambda x: x["bottleneck_score"], reverse=True)

        # Activity metrics
        activity_metrics = []
        for act, freq in sorted(act_freq.items(), key=lambda x: x[1], reverse=True):
            c_count = len(act_cases[act])
            cov_pct = round((c_count / total_cases) * 100.0, 2)
            activity_metrics.append({
                "activity": act,
                "frequency": freq,
                "case_count": c_count,
                "case_coverage_pct": cov_pct
            })

        return {
            "case_metrics": {
                "case_count": total_cases,
                "median_cycle_time_hours": p50,
                "p50_hours": p50,
                "p75_hours": p75,
                "p90_hours": p90,
                "p95_hours": p95,
                "mean_cycle_time_hours": mean_ct,
                "min_cycle_time_hours": min_ct,
                "max_cycle_time_hours": max_ct
            },
            "process_metrics": {
                "total_variants": len(unique_variants),
                "rework_rate_pct": rework_rate_pct,
                "sla_hours": sla_hours,
                "sla_compliance_pct": sla_compliance_pct,
                "sla_violation_count": sla_violations
            },
            "transition_metrics": transition_metrics,
            "activity_metrics": activity_metrics
        }
