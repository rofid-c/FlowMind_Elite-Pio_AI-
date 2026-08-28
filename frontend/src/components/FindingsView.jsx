import { useState } from 'react';

const SEVERITY_CONFIG = {
  CRITICAL: { color: 'var(--tertiary-container)', badge: 'badge-error', icon: 'error', label: 'KRITIS' },
  HIGH:     { color: 'var(--tertiary)',           badge: 'badge-warn',  icon: 'warning', label: 'TINGGI' },
  MEDIUM:   { color: '#fbbf24',                  badge: 'badge-warn',  icon: 'info', label: 'SEDANG' },
  LOW:      { color: 'var(--compliance-emerald)', badge: 'badge-analyzed', icon: 'check_circle', label: 'RENDAH' },
};

function FindingCard({ finding, onSimulate }) {
  const [expanded, setExpanded] = useState(false);
  const sev = finding.severity || 'MEDIUM';
  const cfg = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.MEDIUM;

  return (
    <div
      className="glass-panel rounded-xl"
      style={{
        padding: 20, borderRadius: 12, position: 'relative', overflow: 'hidden',
        borderLeft: `4px solid ${cfg.color}`, marginBottom: 14,
        background: 'rgba(30, 41, 59, 0.7)', transition: 'border-color 0.15s, box-shadow 0.15s'
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ flex: 1, paddingRight: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className={`badge ${cfg.badge}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{cfg.icon}</span>
              {cfg.label}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--outline)', fontFamily: 'Inter, monospace' }}>
              {finding.type} · Kekuatan Bukti: <strong style={{ color: 'var(--on-surface-variant)' }}>{finding.evidence_strength || 'TINGGI'}</strong>
            </span>
          </div>

          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--on-surface)', lineHeight: 1.4, marginBottom: 4 }}>
            {finding.title}
          </div>
          <div style={{ fontSize: '0.825rem', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
            {finding.what_observed}
          </div>
        </div>

        <button
          style={{ background: 'none', border: 'none', color: 'var(--outline)', cursor: 'pointer', padding: 4 }}
        >
          <span className="material-symbols-outlined">{expanded ? 'expand_less' : 'expand_more'}</span>
        </button>
      </div>

      {expanded && (
        <div className="animate-fadein" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-glass)' }}>
          {/* Evidence Grid */}
          {finding.evidence && Object.keys(finding.evidence).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 8 }}>
                Titik Data Bukti (Evidence Data Points)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {Object.entries(finding.evidence).map(([k, v]) => (
                  <div key={k} style={{ padding: '8px 12px', background: 'var(--surface-container-low)', borderRadius: 6, border: '1px solid var(--border-glass)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--on-surface-variant)', textTransform: 'uppercase' }}>
                      {k.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', fontFamily: 'Inter, monospace', marginTop: 2 }}>
                      {typeof v === 'number' ? v.toLocaleString() : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Why Flagged */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 6 }}>
              Alasan Ditandai (Why Flagged)
            </div>
            <div style={{ fontSize: '0.825rem', color: 'var(--on-surface-variant)', background: 'var(--surface-container-low)', padding: '10px 14px', borderRadius: 8, lineHeight: 1.5, border: '1px solid var(--border-glass)' }}>
              {finding.why_flagged}
            </div>
          </div>

          {/* Potential Causes */}
          {finding.potential_causes?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 8 }}>
                Potensi Akar Masalah (Root Causes)
              </div>
              {finding.potential_causes.map((cause, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: '0.8rem', color: 'var(--on-surface-variant)', marginBottom: 6 }}>
                  <span style={{ color: 'var(--tertiary)', flexShrink: 0 }}>•</span>
                  {cause}
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {finding.recommendations?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 8 }}>
                Rekomendasi Tindakan (Prescriptive Recommendations)
              </div>
              {finding.recommendations.map((rec, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: '0.8rem', color: 'var(--on-surface)', marginBottom: 6 }}>
                  <span style={{ color: 'var(--compliance-emerald)', flexShrink: 0 }}>✓</span>
                  {rec}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            {onSimulate && finding.type === 'BOTTLENECK' && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onSimulate(finding)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>psychology</span>
                Simulasikan Perbaikan di Skenario
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FindingsView({ findings, onSimulate }) {
  const [filter, setFilter] = useState('ALL');
  const severities = [
    { id: 'ALL', label: 'SEMUA' },
    { id: 'CRITICAL', label: 'KRITIS' },
    { id: 'HIGH', label: 'TINGGI' },
    { id: 'MEDIUM', label: 'SEDANG' },
    { id: 'LOW', label: 'RENDAH' },
  ];

  if (!findings || findings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <span className="material-symbols-outlined" style={{ fontSize: 32 }}>troubleshoot</span>
        </div>
        <div className="empty-title">Tidak Ada Temuan Terdeteksi</div>
        <div className="empty-desc">Analisis proses tidak menemukan adanya bottleneck kritis ataupun pelanggaran SLA.</div>
      </div>
    );
  }

  const filtered = filter === 'ALL' ? findings : findings.filter(f => f.severity === filter);

  const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = findings.filter(f => f.severity === 'HIGH').length;

  return (
    <div className="animate-fadein space-y-6">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h3 className="section-title">Temuan Masalah & Analisis Otomatis</h3>
          <p className="section-sub">
            Anomali, bottleneck, dan pola pengerjaan ulang yang terdeteksi pada dataset saat ini.
          </p>
        </div>

        {/* Severity Summary Chips */}
        <div style={{ display: 'flex', gap: 8 }}>
          {criticalCount > 0 && (
            <span className="badge badge-error" style={{ padding: '6px 12px', fontSize: '0.72rem' }}>
              {criticalCount} Kritis
            </span>
          )}
          {highCount > 0 && (
            <span className="badge badge-warn" style={{ padding: '6px 12px', fontSize: '0.72rem' }}>
              {highCount} Prioritas Tinggi
            </span>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--outline)', marginRight: 6, fontWeight: 700, textTransform: 'uppercase' }}>Filter:</span>
        {severities.map(s => (
          <button
            key={s.id}
            onClick={() => setFilter(s.id)}
            className={`btn btn-sm ${filter === s.id ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 6, padding: '4px 12px' }}
          >
            {s.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--on-surface-variant)', fontFamily: 'Inter, monospace' }}>
          Menampilkan {filtered.length} dari {findings.length} temuan
        </span>
      </div>

      {/* Findings List */}
      <div>
        {filtered.map(f => (
          <FindingCard key={f.id} finding={f} onSimulate={onSimulate} />
        ))}
      </div>
    </div>
  );
}
