import uuid
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from backend.models import Finding

class FindingsEngine:

    @staticmethod
    def generate_findings(
        db: Session,
        project_id: str,
        analysis_id: str,
        metrics: Dict[str, Any],
        variants: List[Dict[str, Any]],
        process_graph: Dict[str, Any]
    ) -> List[Finding]:
        """Generates deterministic rule-based findings and recommendations in Bahasa Indonesia."""
        
        # Clear existing findings for this analysis
        db.query(Finding).filter(Finding.analysis_id == analysis_id).delete()

        findings_list = []

        case_metrics = metrics.get("case_metrics", {})
        proc_metrics = metrics.get("process_metrics", {})
        trans_metrics = metrics.get("transition_metrics", [])
        
        median_cycle = case_metrics.get("median_cycle_time_hours", 0.0)
        sla_hours = proc_metrics.get("sla_hours", 24.0)
        total_cases = case_metrics.get("case_count", 0)

        # 1. BOTTLENECK DETECTION RULE
        if trans_metrics and median_cycle > 0:
            top_transition = trans_metrics[0]  # sorted by bottleneck score
            t_median = top_transition.get("median_elapsed_hours", 0.0)
            t_p90 = top_transition.get("p90_elapsed_hours", 0.0)
            src = top_transition.get("source", "")
            tgt = top_transition.get("target", "")

            # If transition takes more than 25% of median cycle time or is exceptionally long
            if t_median >= 0.25 * median_cycle or t_median >= 2.0:
                severity = "CRITICAL" if (t_median >= 0.5 * median_cycle or t_p90 >= sla_hours) else "HIGH"
                share_pct = round((t_median / median_cycle) * 100.0, 1) if median_cycle > 0 else 0

                finding = Finding(
                    id=f"find_{uuid.uuid4().hex[:8]}",
                    project_id=project_id,
                    analysis_id=analysis_id,
                    type="BOTTLENECK",
                    title=f"Keterlambatan Signifikan pada Transisi: {src} → {tgt}",
                    severity=severity,
                    what_observed=f"Transisi dari '{src}' ke '{tgt}' memakan waktu median {t_median} jam (P90: {t_p90} jam), menyumbang ~{share_pct}% dari total waktu siklus proses.",
                    evidence_json={
                        "transition": f"{src} → {tgt}",
                        "median_elapsed_hours": t_median,
                        "p90_elapsed_hours": t_p90,
                        "frequency": top_transition.get("frequency", 0),
                        "share_of_cycle_time_pct": share_pct
                    },
                    why_flagged=f"Durasi transisi ini secara signifikan melebihi kecepatan proses standar dan merupakan titik hambatan (bottleneck) utama.",
                    potential_causes_json=[
                        "Waktu antrean yang panjang atau keterbatasan kapasitas tim operasional",
                        "Penumpukan ulasan manual tanpa adanya alokasi pengerjaan paralel",
                        "Data prasyarat yang belum lengkap sehingga menunda proses persetujuan"
                    ],
                    recommendations_json=[
                        f"Terapkan peringatan dini batas waktu SLA untuk transisi {src} → {tgt}",
                        "Evaluasi beban kerja antrean reviewer sebelum mengubah regulasi alur kerja",
                        "Terapkan validasi otomatis atau persetujuan instan untuk kasus berisiko rendah"
                    ],
                    evidence_strength="TINGGI",
                    status="ACTIVE"
                )
                findings_list.append(finding)

        # 2. REWORK / LOOP DETECTION RULE
        rework_rate = proc_metrics.get("rework_rate_pct", 0.0)
        if rework_rate >= 5.0:
            severity = "HIGH" if rework_rate >= 15.0 else "MEDIUM"
            finding = Finding(
                id=f"find_{uuid.uuid4().hex[:8]}",
                project_id=project_id,
                analysis_id=analysis_id,
                type="REWORK",
                title=f"Tingkat Pengerjaan Ulang & Pengulangan Tinggi ({rework_rate}%)",
                severity=severity,
                what_observed=f"{rework_rate}% kasus mengalami pengulangan aktivitas (loopback), yang menandakan adanya ketidakefisienan proses.",
                evidence_json={
                    "rework_rate_pct": rework_rate,
                    "affected_cases_approx": int(total_cases * (rework_rate / 100.0)),
                    "total_cases": total_cases
                },
                why_flagged="Pengerjaan ulang menyebabkan pembengkakan waktu siklus dan pemborosan kapasitas sumber daya tim.",
                potential_causes_json=[
                    "Informasi awal ditolak karena dokumen/persyaratan kurang lengkap",
                    "Kriteria pengajuan kurang jelas sehingga terjadi komunikasi bolak-balik",
                    "Kurangnya validasi data otomatis di tahap awal pengajuan"
                ],
                recommendations_json=[
                    "Terapkan formulir validasi awal untuk mencegah kesalahan sebelum data diajukan",
                    "Sediakan checklist panduan yang jelas bagi pemohon untuk mencegah penolakan"
                ],
                evidence_strength="TINGGI" if rework_rate >= 15.0 else "SEDANG",
                status="ACTIVE"
            )
            findings_list.append(finding)

        # 3. SLA BREACH RULE
        sla_violation_count = proc_metrics.get("sla_violation_count", 0)
        if total_cases > 0 and sla_violation_count > 0:
            violation_rate = round((sla_violation_count / total_cases) * 100.0, 2)
            if violation_rate >= 5.0:
                severity = "CRITICAL" if violation_rate >= 20.0 else "HIGH"
                finding = Finding(
                    id=f"find_{uuid.uuid4().hex[:8]}",
                    project_id=project_id,
                    analysis_id=analysis_id,
                    type="SLA_VIOLATION",
                    title=f"Pelanggaran Batas Waktu SLA pada {violation_rate}% Kasus",
                    severity=severity,
                    what_observed=f"{sla_violation_count} dari {total_cases} kasus ({violation_rate}%) melebihi target SLA yaitu {sla_hours} jam.",
                    evidence_json={
                        "sla_target_hours": sla_hours,
                        "violation_rate_pct": violation_rate,
                        "violated_cases_count": sla_violation_count,
                        "p90_cycle_time_hours": case_metrics.get("p90_hours", 0.0)
                    },
                    why_flagged=f"Waktu siklus persentil P90 mencapai {case_metrics.get('p90_hours', 0.0)} jam, jauh melampaui target SLA {sla_hours} jam.",
                    potential_causes_json=[
                        "Akumulasi waktu tunggu antrean di beberapa tahapan manual berturut-turut",
                        "Kasus-kasus anomali tersangkut di antrean yang tidak dipantau secara berkala",
                        "Penumpukan pemrosesan berkas secara periodik/batch"
                    ],
                    recommendations_json=[
                        f"Atur eskalasi notifikasi otomatis saat tiket mencapai 70% batas SLA ({round(sla_hours * 0.7, 1)} jam)",
                        "Prioritaskan tiket yang mendekati batas waktu dibanding metode first-in-first-out"
                    ],
                    evidence_strength="TINGGI",
                    status="ACTIVE"
                )
                findings_list.append(finding)

        # 4. VARIANT ANOMALY / DEVIATION RULE
        if len(variants) > 1:
            main_variant = variants[0]
            for var in variants[1:4]:
                if var["median_cycle_hours"] >= 1.5 * main_variant["median_cycle_hours"] and var["cases"] >= 2:
                    finding = Finding(
                        id=f"find_{uuid.uuid4().hex[:8]}",
                        project_id=project_id,
                        analysis_id=analysis_id,
                        type="VARIANT_ANOMALY",
                        title=f"Varian Inefisien #{var['rank']} Memiliki Durasi Median {var['median_cycle_hours']} Jam",
                        severity="MEDIUM",
                        what_observed=f"Varian #{var['rank']} ({var['variant']}) mencakup {var['share_pct']}% kasus namun memakan waktu {var['median_cycle_hours']} jam dibanding {main_variant['median_cycle_hours']} jam pada jalur standar.",
                        evidence_json={
                            "variant_rank": var["rank"],
                            "variant_path": var["variant"],
                            "cases_count": var["cases"],
                            "share_pct": var["share_pct"],
                            "median_cycle_hours": var["median_cycle_hours"],
                            "baseline_cycle_hours": main_variant["median_cycle_hours"]
                        },
                        why_flagged=f"Penyimpangan jalur varian ini memakan waktu {round(var['median_cycle_hours'] / (main_variant['median_cycle_hours'] or 1), 1)}x lebih lambat dibanding jalur utama.",
                        potential_causes_json=[
                            "Jalur eskalasi non-standar untuk penanganan kasus pengecualian",
                            "Pengecekan manual berulang tanpa sistem terintegrasi"
                        ],
                        recommendations_json=[
                            "Standarisasi alur penanganan pengecualian agar tidak terjadi jalan memutar yang lama",
                            "Arahkan kasus pengecualian umum ke alur kerja digital terpandu"
                        ],
                        evidence_strength="SEDANG",
                        status="ACTIVE"
                    )
                    findings_list.append(finding)

        # Save to database
        for f in findings_list:
            db.add(f)
        db.commit()

        return findings_list
