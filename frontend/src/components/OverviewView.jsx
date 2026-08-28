import { useMemo } from 'react';

const EMPTY_SUMMARY = {
  case_count: 0,
  total_cases: 0,
  median_cycle_time_hours: 0,
  sla_compliance_pct: 0,
  rework_rate_pct: 0,
};

function KpiCard({ label, value, unit, trend, trendLabel, trendGood, icon, accentClass, iconClass }) {
  return (
    <div className={`kpi-card ${accentClass || ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <span className="kpi-label">{label}</span>
        <span className={`material-symbols-outlined kpi-icon ${iconClass || ''}`} style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2.6rem', fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1 }}>
          {value}
          {unit && <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--outline)', marginLeft: 4 }}>{unit}</span>}
        </div>
        {trend && (
          <div className={`kpi-trend ${trendGood ? 'good' : 'bad'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{trendGood ? 'trending_up' : 'trending_down'}</span>
            <span>{trendLabel}</span>
          </div>
        )}
        {unit === '%' && (
          <div className="kpi-progress" style={{ marginTop: 12 }}>
            <div className="kpi-progress-fill emerald" style={{ width: `${Math.min(100, Math.max(0, parseFloat(value) || 0))}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function FindingItem({ finding, onClick }) {
  const isWarn = finding.severity === 'CRITICAL' || finding.severity === 'HIGH';
  const isCyan = finding.severity === 'LOW';
  const iconClass = isWarn ? 'warn' : isCyan ? 'cyan' : 'info';
  const icon     = isWarn ? 'warning' : isCyan ? 'payments' : 'alt_route';

  const sevLabel = {
    'CRITICAL': 'KRITIS',
    'HIGH': 'TINGGI',
    'MEDIUM': 'SEDANG',
    'LOW': 'RENDAH'
  }[finding.severity] || finding.severity;

  return (
    <div className={`finding-card ${iconClass}`} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div className={`finding-icon ${iconClass}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div className="finding-title">{finding.title}</div>
          <div className="finding-desc line-clamp-2">{finding.what_observed}</div>
          <div className="finding-tags">
            <span className="finding-tag">DAMPAK: {sevLabel}</span>
            <span className="finding-tag">{finding.type}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OverviewView({ summary, metrics, graph, findings, onTabChange, projectName, onUpload }) {
  const s = summary || EMPTY_SUMMARY;

  const totalCases  = s.total_cases || s.case_count || metrics?.case_metrics?.case_count || metrics?.case_metrics?.total_cases || 0;
  const cycleHours  = s.median_cycle_time_hours || metrics?.case_metrics?.median_cycle_time_hours || metrics?.cycle_time_percentiles?.p50 || 0;
  const cycleDays   = cycleHours ? (cycleHours >= 24 ? `${(cycleHours / 24).toFixed(1)} hr` : `${cycleHours.toFixed(1)} jam`) : '—';
  const slaComp     = s.sla_compliance_pct ?? metrics?.process_metrics?.sla_compliance_pct ?? metrics?.sla_metrics?.sla_compliance_pct ?? 0;
  const reworkRate  = s.rework_rate_pct ?? metrics?.process_metrics?.rework_rate_pct ?? metrics?.rework_metrics?.rework_rate_pct ?? 0;

  const topFindings = useMemo(() => (findings || []).slice(0, 3), [findings]);

  // Mini DFG preview data
  const nodes = graph?.nodes?.slice(0, 4) || [];
  const edges = graph?.edges || [];

  const hasData = totalCases > 0 || (graph?.nodes?.length > 0) || (findings?.length > 0);

  if (!hasData) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h3 className="section-title">Ringkasan Proses (Overview)</h3>
          <p className="section-sub">Gambaran performa dan inteligensi proses bisnis.</p>
        </div>
        <div className="empty-state" style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid var(--border-glass)', borderRadius: 12, minHeight: 300 }}>
          <div className="empty-icon">
            <span className="material-symbols-outlined" style={{ fontSize: 32 }}>analytics</span>
          </div>
          <div className="empty-title">Belum Ada Data Analisis</div>
          <div className="empty-desc">Unggah dataset event log untuk mulai menemukan analitik dan insight proses.</div>
          <button className="btn btn-primary" onClick={onUpload}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload</span>
            Unggah Dataset
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadein">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h3 className="section-title">Ringkasan Proses (Overview)</h3>
        <p className="section-sub">Ringkasan performa alur kerja — {projectName || 'Proyek Aktif'}</p>
      </div>

      {/* KPI Bento Grid */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <KpiCard
          label="Total Kasus (Cases)"
          value={totalCases.toLocaleString()}
          icon="inventory_2"
          iconClass="group-primary"
          trend trendLabel="Volume Terverifikasi" trendGood
        />
        <KpiCard
          label="Median Waktu Siklus"
          value={cycleDays}
          icon="timer"
          iconClass="group-primary"
          trend trendLabel="Waktu Tengah (P50)" trendGood
        />
        <KpiCard
          label="Kepatuhan SLA"
          value={`${Number(slaComp).toFixed(1)}%`}
          unit="%"
          icon="verified"
          iconClass="group-secondary"
          trend trendLabel={slaComp >= 85 ? "Sesuai Target" : "Perlu Perhatian"} trendGood={slaComp >= 85}
        />
        <KpiCard
          label="Tingkat Pengerjaan Ulang"
          value={`${Number(reworkRate).toFixed(1)}%`}
          icon="replay"
          iconClass="group-tertiary"
          trend trendLabel={reworkRate > 10 ? "Loopback Tinggi" : "Optimal"} trendGood={reworkRate <= 10}
        />
      </div>

      {/* Bottom Grid: Process Discovery Preview + Top Findings */}
      <div className="overview-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
        
        {/* Left: Mini Process Discovery Preview */}
        <div className="glass-panel" style={{ padding: 24, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--on-surface)' }}>Grafik Alur Proses (DFG)</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                {graph?.nodes?.length || 0} Aktivitas · {edges.length} Transisi Jalur
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onTabChange('map')}>
              <span>Buka Process Map</span>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
            </button>
          </div>

          {/* Node Flow Preview Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 16, background: 'var(--surface-container-lowest)', borderRadius: 10, border: '1px solid var(--border-glass)', marginBottom: 16 }}>
            {nodes.map((n, i) => (
              <div key={n.id || i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge badge-ready" style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600 }}>
                  {n.label || n.name}
                </span>
                {i < nodes.length - 1 && (
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--outline)' }}>arrow_forward</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            💡 Model grafik keterhubungan langsung diekstraksi dari database SQLite secara deterministik tanpa jeda kalkulasi ulang.
          </div>
        </div>

        {/* Right: Top Findings & Anomalies */}
        <div className="glass-panel" style={{ padding: 24, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--on-surface)' }}>Temuan Utama (Top Findings)</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                {findings?.length || 0} Anomali & Bottleneck Terdeteksi
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onTabChange('findings')}>
              <span>Lihat Semua</span>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topFindings.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--on-surface-variant)', fontSize: '0.85rem' }}>
                Tidak ada anomali kritis yang terdeteksi pada proses ini.
              </div>
            ) : (
              topFindings.map(f => (
                <FindingItem key={f.id} finding={f} onClick={() => onTabChange('findings')} />
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
