export default function MetricsView({ metrics }) {
  if (!metrics) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <span className="material-symbols-outlined" style={{ fontSize: 32 }}>analytics</span>
        </div>
        <div className="empty-title">Belum Ada Metrik</div>
        <div className="empty-desc">Jalankan analisis untuk melihat waktu siklus, kepatuhan SLA, dan hambatan proses.</div>
      </div>
    );
  }

  const cases = metrics.case_metrics || {};
  const proc = metrics.process_metrics || {};
  
  // Flexible percentile extraction
  const p50 = metrics.cycle_time_percentiles?.p50 ?? cases.p50_hours ?? cases.median_cycle_time_hours;
  const p75 = metrics.cycle_time_percentiles?.p75 ?? cases.p75_hours;
  const p90 = metrics.cycle_time_percentiles?.p90 ?? cases.p90_hours;
  const p95 = metrics.cycle_time_percentiles?.p95 ?? cases.p95_hours;

  const medianDays = (p50 != null && p50 !== 0) ? (p50 >= 24 ? `${(p50 / 24).toFixed(1)} hari` : `${p50} jam`) : (p50 === 0 ? '0 jam' : '—');
  const p90Days = (p90 != null && p90 !== 0) ? (p90 >= 24 ? `${(p90 / 24).toFixed(1)} hari` : `${p90} jam`) : (p90 === 0 ? '0 jam' : '—');
  const slaComp = proc.sla_compliance_pct ?? metrics.sla_metrics?.sla_compliance_pct ?? 0;
  
  const transitions = metrics.transition_metrics || metrics.transition_bottlenecks || [];
  const activities = metrics.activity_metrics || [];
  const totalCasesCount = cases.case_count ?? cases.total_cases ?? 0;
  const maxNodeFreq = Math.max(...activities.map(a => a.count || a.frequency || 0), 1);

  return (
    <div className="animate-fadein space-y-6">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h3 className="section-title">Ringkasan Metrik Proses</h3>
        <p className="section-sub">Analisis eksekutif performa alur kerja, distribusi waktu, dan titik hambatan (bottleneck).</p>
      </div>

      {/* Top KPIs (Stitch 3-Column Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 24 }}>
        {/* KPI 1: Median Cycle Time */}
        <div className="glass-panel rounded-xl p-6 relative overflow-hidden" style={{ borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <span className="kpi-label">Median Waktu Siklus (P50)</span>
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 22 }}>schedule</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2.5rem', fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1 }}>
              {medianDays}
            </span>
            {p50 != null && <span style={{ fontSize: '0.9rem', color: 'var(--on-surface-variant)', fontWeight: 600 }}>({p50} jam)</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: '0.78rem', color: 'var(--compliance-emerald)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>trending_down</span>
            <span>Berdasarkan {totalCasesCount.toLocaleString()} kasus terverifikasi</span>
          </div>
        </div>

        {/* KPI 2: P90 Cycle Time */}
        <div className="glass-panel rounded-xl p-6 relative overflow-hidden" style={{ borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <span className="kpi-label">Waktu Siklus Persentil P90</span>
            <span className="material-symbols-outlined text-tertiary" style={{ fontSize: 22 }}>warning</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2.5rem', fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1 }}>
              {p90Days}
            </span>
            {p90 != null && <span style={{ fontSize: '0.9rem', color: 'var(--on-surface-variant)', fontWeight: 600 }}>({p90} jam)</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: '0.78rem', color: 'var(--tertiary)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>trending_up</span>
            <span>Tolok ukur kasus ekor panjang (long tail delay)</span>
          </div>
        </div>

        {/* KPI 3: SLA Compliance */}
        <div className="glass-panel rounded-xl p-6 relative overflow-hidden" style={{ borderRadius: 12, padding: 24, border: '1px solid rgba(16,185,129,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <span className="kpi-label">Kepatuhan Batas Waktu SLA</span>
            <span className="material-symbols-outlined text-emerald" style={{ fontSize: 22 }}>verified</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2.5rem', fontWeight: 700, color: 'var(--compliance-emerald)', lineHeight: 1 }}>
              {Number(slaComp).toFixed(1)}%
            </span>
          </div>
          <div className="kpi-progress" style={{ marginTop: 12 }}>
            <div className="kpi-progress-fill emerald" style={{ width: `${Math.min(100, Math.max(0, slaComp))}%` }} />
          </div>
        </div>
      </div>

      {/* Grid: Percentiles + Transition Bottlenecks */}
      <div className="grid-12" style={{ marginBottom: 24 }}>
        {/* Cycle Time Percentiles Breakdown (5 cols) */}
        <div className="col-5">
          <div className="glass-panel rounded-xl" style={{ padding: 24, borderRadius: 12, height: '100%' }}>
            <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: 4 }}>
              Distribusi Persentil Waktu
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', marginBottom: 20 }}>Sebaran durasi pengerjaan dari seluruh kasus yang selesai.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'P50 (Waktu Median)', value: p50, col: 'var(--primary)' },
                { label: 'P75 (Kuartil Atas)', value: p75, col: 'var(--secondary)' },
                { label: 'P90 (Kasus Lambat / Long Tail)', value: p90, col: 'var(--tertiary)' },
                { label: 'P95 (Kasus Ekstrem)', value: p95, col: 'var(--tertiary-container)' },
              ].map(({ label, value, col }) => (
                <div key={label} style={{ padding: '12px 16px', background: 'var(--surface-container)', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--on-surface-variant)' }}>{label}</span>
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: col, fontSize: '1.1rem' }}>
                      {value != null ? `${value} jam` : '—'}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'var(--surface-container-highest)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, ((value || 0) / (p95 || 1)) * 100)}%`, background: col, borderRadius: 999 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Transition Bottlenecks Table (7 cols) */}
        <div className="col-7">
          <div className="glass-panel rounded-xl" style={{ padding: 24, borderRadius: 12, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: 4 }}>
              Titik Hambatan Transisi Teratas (Bottlenecks)
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', marginBottom: 16 }}>Transisi dengan konsumsi waktu tunggu median paling tinggi.</p>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transisi Alur</th>
                    <th>Median</th>
                    <th>P90</th>
                    <th>Frekuensi</th>
                  </tr>
                </thead>
                <tbody>
                  {transitions.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--on-surface-variant)' }}>Tidak ada transisi ditemukan</td></tr>
                  ) : transitions.map((t, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--on-surface)' }}>
                          <span style={{ color: 'var(--on-surface)' }}>{t.source}</span>
                          <span className="material-symbols-outlined text-outline" style={{ fontSize: 13 }}>arrow_forward</span>
                          <span style={{ color: 'var(--primary)' }}>{t.target}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--tertiary-container)', fontWeight: 700 }}>{t.median_elapsed_hours} jam</td>
                      <td style={{ color: 'var(--tertiary)' }}>{t.p90_elapsed_hours} jam</td>
                      <td style={{ color: 'var(--on-surface)' }}>{t.frequency?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Volume & Performance Table */}
      {activities.length > 0 && (
        <div className="glass-panel rounded-xl" style={{ padding: 24, borderRadius: 12 }}>
          <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: 4 }}>
            Rincian Beban Eksekusi per Aktivitas
          </h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', marginBottom: 16 }}>Frekuensi eksekusi dan persentase keterlibatan kasus pada tiap aktivitas.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nama Aktivitas</th>
                  <th>Jumlah Eksekusi</th>
                  <th>Pangsa Relatif</th>
                  <th>Cakupan Kasus</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((act, i) => {
                  const cnt = act.count || act.frequency || 0;
                  const pct = Math.round((cnt / maxNodeFreq) * 100);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: 'var(--on-surface)' }}>{act.activity || act.name || act.id}</td>
                      <td>{cnt.toLocaleString()}</td>
                      <td style={{ width: 180 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--surface-container-highest)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 999 }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--outline)', minWidth: 32 }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--compliance-emerald)', fontWeight: 600 }}>{act.case_coverage_pct ?? '—'}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
