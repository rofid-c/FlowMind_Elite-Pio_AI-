import { useState, useEffect } from 'react';
import api from '../api/client';

export default function ScenarioView({ projectId, analysisId, metrics, graph, prefilledScenario }) {
  const [changeType, setChangeType] = useState(() => prefilledScenario?.changeType || 'REDUCE_DURATION');
  const [target, setTarget] = useState(() => prefilledScenario?.target || '');
  const [paramVal, setParamVal] = useState(30);
  const [name, setName] = useState(() => prefilledScenario?.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (prefilledScenario) {
      if (prefilledScenario.target) setTarget(prefilledScenario.target);
      if (prefilledScenario.changeType) setChangeType(prefilledScenario.changeType);
      if (prefilledScenario.name) setName(prefilledScenario.name);
    }
  }, [prefilledScenario]);

  const edges = graph?.edges || [];
  const edgeOptions = edges.map(e => `${e.source} -> ${e.target}`);
  const nodeOptions = graph?.nodes?.map(n => n.id) || [];

  const handleSimulate = async () => {
    if (!target) return setError('Silakan pilih target transisi atau aktivitas terlebih dahulu.');
    if (!analysisId) return setError('Belum ada analisis selesai. Silakan jalankan analisis terlebih dahulu.');
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const scen = await api.createScenario(projectId, {
        name: name || `${changeType === 'REDUCE_DURATION' ? 'Kurangi Waktu' : 'Eliminasi'} "${target}" (${paramVal}%)`,
        change_type: changeType,
        target,
        parameter_val: paramVal,
      });

      const validation = await api.validateScenario(scen.id, analysisId);
      if (!validation.valid) {
        setError(`Validasi skenario gagal: ${validation.reason}`);
        setLoading(false);
        return;
      }

      const simRes = await api.simulateScenario(scen.id, analysisId);
      setResult(simRes);
    } catch (e) {
      setError(e.message || 'Simulasi gagal dijalankan');
    } finally {
      setLoading(false);
    }
  };

  const deltaHours = result?.change?.cycle_time_hours ?? 0;
  const deltaPct   = result?.change?.cycle_time_pct ?? 0;
  const isImproved = deltaHours < 0;

  return (
    <div className="animate-fadein space-y-6">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h3 className="section-title">Pembangun Skenario What-If (Scenario Builder)</h3>
        <p className="section-sub">Simulasikan hipotesis optimasi proses dan proyeksikan dampaknya terhadap waktu siklus serta kepatuhan SLA.</p>
      </div>

      <div className="grid-12">
        {/* Left Column: Configuration Form (5 cols) */}
        <div className="col-5">
          <div className="glass-panel rounded-xl" style={{ padding: 24, borderRadius: 12 }}>
            <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>tune</span>
              Parameter Skenario
            </h4>

            <div className="form-group">
              <label className="form-label">Nama Skenario (Opsional)</label>
              <input
                className="form-input"
                placeholder="contoh: Otomasi Persetujuan Reviewer"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Jenis Intervensi Simulasi</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { id: 'REDUCE_DURATION', label: 'Pangkas Durasi', icon: 'speed', desc: 'Kurangi waktu tunggu pada langkah' },
                  { id: 'REMOVE_ACTIVITY', label: 'Eliminasi Tahap', icon: 'delete_sweep', desc: 'Lewati aktivitas yang tidak bernilai' },
                ].map(opt => (
                  <div
                    key={opt.id}
                    onClick={() => { setChangeType(opt.id); setTarget(''); }}
                    style={{
                      padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                      background: changeType === opt.id ? 'rgba(192, 193, 255, 0.1)' : 'var(--surface-container)',
                      border: `1px solid ${changeType === opt.id ? 'var(--primary)' : 'var(--border-glass)'}`,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: changeType === opt.id ? 'var(--primary)' : 'var(--outline)' }}>
                        {opt.icon}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: changeType === opt.id ? 'var(--primary)' : 'var(--on-surface)' }}>
                        {opt.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--on-surface-variant)' }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                {changeType === 'REDUCE_DURATION' ? 'Target Transisi' : 'Target Aktivitas'}
              </label>
              <select
                className="form-select"
                value={target}
                onChange={e => setTarget(e.target.value)}
              >
                <option value="">— Pilih target yang dioptimasi —</option>
                {(changeType === 'REDUCE_DURATION' ? edgeOptions : nodeOptions).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {changeType === 'REDUCE_DURATION' && (
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="form-label">Target Pengurangan Durasi Waktu</label>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--primary)', fontSize: '0.9rem' }}>
                    {paramVal}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5} max={90} step={5}
                  value={paramVal}
                  onChange={e => setParamVal(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--outline)', marginTop: 4 }}>
                  <span>5% (Konservatif)</span>
                  <span>50% (Target Ideal)</span>
                  <span>90% (Agresif)</span>
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,81,106,0.1)', border: '1px solid rgba(255,81,106,0.3)', color: 'var(--tertiary-container)', fontSize: '0.8rem', marginBottom: 16, display: 'flex', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary btn-full btn-lg"
              disabled={loading || !target}
              onClick={handleSimulate}
              style={{ marginTop: 8 }}
            >
              {loading ? (
                <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 18 }}>progress_activity</span> Menghitung Simulasi Dampak…</>
              ) : (
                <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span> Jalankan Simulasi</>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Simulation Results (7 cols) */}
        <div className="col-7">
          {!result && !loading && (
            <div className="glass-panel rounded-xl" style={{ padding: 48, borderRadius: 12, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16 }}>
              <div className="empty-icon">
                <span className="material-symbols-outlined" style={{ fontSize: 36 }}>science</span>
              </div>
              <div className="empty-title">Siap untuk Simulasi</div>
              <div className="empty-desc">Pilih target bottleneck atau aktivitas di panel kiri untuk memproyeksikan efisiensi proses.</div>
            </div>
          )}

          {loading && (
            <div className="glass-panel rounded-xl" style={{ padding: 48, borderRadius: 12, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 44 }}>progress_activity</span>
              <div className="empty-title">Menghitung Simulasi Peta Proses…</div>
              <div className="empty-desc">Mengkalkulasi ulang durasi rangkaian urutan peristiwa di seluruh 10.000+ kasus.</div>
            </div>
          )}

          {result && (
            <div className="glass-panel rounded-xl animate-fadein" style={{ padding: 24, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined text-emerald" style={{ fontSize: 22 }}>check_circle</span>
                  <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 600, color: 'var(--on-surface)' }}>
                    Hasil Proyeksi Simulasi
                  </h4>
                </div>
                <span className="badge badge-analyzed">{result.evidence_strength || 'Deterministik'}</span>
              </div>

              {/* Delta Banner */}
              <div style={{
                textAlign: 'center', padding: '20px 16px', borderRadius: 12,
                background: isImproved ? 'rgba(16,185,129,0.08)' : 'rgba(255,81,106,0.08)',
                border: `1px solid ${isImproved ? 'rgba(16,185,129,0.3)' : 'rgba(255,81,106,0.3)'}`,
                marginBottom: 24
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--on-surface-variant)', marginBottom: 6 }}>
                  Proyeksi Dampak pada Total Waktu Siklus
                </div>
                <div style={{
                  fontFamily: 'Outfit, sans-serif', fontSize: '2.4rem', fontWeight: 700,
                  color: isImproved ? 'var(--compliance-emerald)' : 'var(--tertiary-container)', lineHeight: 1
                }}>
                  {deltaHours > 0 ? `+${deltaHours}` : deltaHours} jam ({deltaPct > 0 ? `+${deltaPct}` : deltaPct}%)
                </div>
              </div>

              {/* Comparison Grid: Baseline vs Simulated */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                {/* Current Baseline */}
                <div style={{ padding: 16, background: 'var(--surface-container-low)', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 12 }}>
                    Kondisi Saat Ini (Baseline)
                  </div>
                  {[
                    { label: 'Median Waktu Siklus', val: `${result.current?.median_cycle_time_hours ?? '—'} jam` },
                    { label: 'Waktu Siklus P90',    val: `${result.current?.p90_cycle_time_hours ?? '—'} jam` },
                    { label: 'Pelanggaran SLA',    val: `${result.current?.sla_violation_pct ?? '—'}%` },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
                      <span style={{ fontWeight: 600, color: 'var(--on-surface)', fontFamily: 'Inter, monospace' }}>{val}</span>
                    </div>
                  ))}
                </div>

                {/* Simulated Outcome */}
                <div style={{ padding: 16, background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--compliance-emerald)', marginBottom: 12 }}>
                    Setelah Optimasi (Proyeksi)
                  </div>
                  {[
                    { label: 'Median Waktu Siklus', val: `${result.scenario?.median_cycle_time_hours ?? '—'} jam` },
                    { label: 'Waktu Siklus P90',    val: `${result.scenario?.p90_cycle_time_hours ?? '—'} jam` },
                    { label: 'Pelanggaran SLA',    val: `${result.scenario?.sla_violation_pct ?? '—'}%` },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
                      <span style={{ fontWeight: 700, color: 'var(--compliance-emerald)', fontFamily: 'Inter, monospace' }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assumptions */}
              {result.assumptions?.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 8 }}>
                    Asumsi Model Simulasi
                  </div>
                  {result.assumptions.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, fontSize: '0.75rem', color: 'var(--on-surface-variant)', marginBottom: 4 }}>
                      <span className="material-symbols-outlined text-emerald" style={{ fontSize: 13, flexShrink: 0 }}>check</span>
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
