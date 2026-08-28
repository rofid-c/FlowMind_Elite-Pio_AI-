import { useState, useRef, useCallback } from 'react';
import api from '../api/client';

const REQUIRED_FIELDS = [
  { key: 'case_id',    label: 'Pengidentifikasi Kasus (Case ID)', icon: 'key',                  required: true,  desc: 'Kolom unik per alur (ticket_id, order_no, claim_ref)' },
  { key: 'activity',   label: 'Aktivitas / Peristiwa (Activity)', icon: 'format_list_bulleted', required: true,  desc: 'Nama langkah proses (status, task_name, action)' },
  { key: 'timestamp',  label: 'Waktu Peristiwa (Timestamp)',      icon: 'schedule',             required: true,  desc: 'Tanggal dan jam eksekusi kejadian' },
  { key: 'actor',      label: 'Pelaksana / Aktor (Actor)',        icon: 'person',               required: false, desc: 'Petugas atau sistem yang mengeksekusi (opsional)' },
  { key: 'department', label: 'Departemen / Tim (Department)',    icon: 'business',             required: false, desc: 'Unit organisasi pelaksana (opsional)' },
];

const STEPS = ['Unggah & Inspeksi', 'Pemetaan Cerdas', 'Matriks Kapabilitas', 'Konfirmasi & Analisis'];

export default function DatasetIngestionFlow({ projectId, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);
  const [datasetId, setDatasetId] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [classification, setClassification] = useState(null);
  const [mappingProposal, setMappingProposal] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [quality, setQuality] = useState(null);
  const [slaHours, setSlaHours] = useState(48);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  // ── Step 0: Upload & Deep Inspection ──────────────────────────────
  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    setError('');
    setLoading(true);
    try {
      const res = await api.uploadDataset(projectId, f);
      setDatasetId(res.id);
      setColumns(res.detected_columns || []);
      setInspection(res.inspection);
      setClassification(res.classification);
      setMappingProposal(res.mapping_proposal);
      setCapabilities(res.capabilities);
      setPreview(res.preview_rows || []);

      if (res.mapping_proposal?.mapping) {
        setMapping(res.mapping_proposal.mapping);
      }

      setStep(1);
    } catch (e) {
      setError(e.message || 'Gagal mengunggah dataset. Periksa format file CSV/XLSX Anda.');
    }
    setLoading(false);
  };

  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) await handleFile(f);
  }, [projectId]);

  // ── Step 1: Mapping Validation ──────────────────────────────
  const requiredMapped = Boolean(mapping.case_id && mapping.activity && mapping.timestamp);

  const handleContinueToQuality = async () => {
    if (!requiredMapped) {
      setError('Harap petakan minimal 3 kolom utama: Case ID, Activity, dan Timestamp.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // 1. Save mapping
      await api.saveMapping(datasetId, {
        case_id: mapping.case_id,
        activity: mapping.activity,
        timestamp: mapping.timestamp,
        actor: mapping.actor || null,
        department: mapping.department || null,
        custom_attributes: {}
      });

      // 2. Request updated capabilities & quality preview
      const [q, caps] = await Promise.all([
        api.previewDataset(datasetId),
        api.getCapabilities(datasetId)
      ]);
      setQuality(q);
      setCapabilities(caps);
      setStep(2);
    } catch (e) {
      setError(e.message || 'Validasi pemetaan kolom gagal.');
    }
    setLoading(false);
  };

  // ── Step 3: Finalize / Transform & Run Analysis ─────────────────
  const handleFinalize = async () => {
    setError('');
    setLoading(true);
    try {
      // 1. Confirm canonical transformation
      await api.confirmDataset(datasetId);

      // 2. Trigger analysis
      const result = await api.triggerAnalysis(datasetId, { sla_hours: slaHours });
      onComplete(result);
    } catch (e) {
      setError(e.message || 'Eksekusi analisis proses gagal.');
    }
    setLoading(false);
  };

  const stepProgress = `${(step / (STEPS.length - 1)) * 100}%`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)', color: 'var(--on-surface)', position: 'relative', overflow: 'hidden' }}>
      {/* Ambient orbs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '50%', height: '50%', borderRadius: '50%', background: 'rgba(192,193,255,0.04)', filter: 'blur(120px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '40%', height: '40%', borderRadius: '50%', background: 'rgba(76,215,246,0.04)', filter: 'blur(100px)' }} />
      </div>

      {/* Flow header */}
      <header className="flow-header" style={{ position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>dataset</span>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 600, color: 'var(--on-surface)' }}>
            Universal Dataset Ingestion & Schema Intelligence
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--on-surface-variant)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', transition: 'color 0.15s' }}
          onMouseOver={e => e.currentTarget.style.color = 'var(--on-surface)'}
          onMouseOut={e => e.currentTarget.style.color = 'var(--on-surface-variant)'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          Batalkan Unggah
        </button>
      </header>

      {/* Main workspace */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 32px', maxWidth: 1400, margin: '0 auto', width: '100%', gap: 24, position: 'relative', zIndex: 10 }}>

        {/* Stepper */}
        <div className="stepper">
          <div className="stepper-track" />
          <div className="stepper-progress" style={{ width: stepProgress }} />
          {STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'pending';
            return (
              <div key={i} className="stepper-step" style={{ opacity: state === 'pending' ? 0.5 : 1 }}>
                <div className={`step-dot ${state}`}>
                  {state === 'done'
                    ? <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                    : i + 1}
                </div>
                <span className={`step-label ${state}`}>{i + 1}. {label}</span>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(255,81,106,0.1)', border: '1px solid rgba(255,81,106,0.3)', color: '#ff516a', fontSize: '0.8rem', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, flexShrink: 0 }}>error</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── STEP 0: Upload & Schema Profiling ── */}
        {step === 0 && (
          <div className="animate-fadein" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 460 }}>
            <div
              className={`dropzone ${dragging ? 'dragover' : ''}`}
              style={{ width: '100%', maxWidth: 700, padding: '56px 40px', textAlign: 'center', cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])}
              />
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(192, 193, 255, 0.1)', border: '1px solid rgba(192, 193, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 32 }}>cloud_upload</span>
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.4rem', fontWeight: 700, color: 'var(--on-surface)', marginBottom: 8 }}>
                Pilih atau Tarik File Dataset ke Sini
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--on-surface-variant)', marginBottom: 20 }}>
                Mendukung format <strong>CSV, XLSX, XLS</strong> dengan struktur nama kolom bebas (akan dipetakan secara otomatis).
              </div>
              <button className="btn btn-primary btn-lg" onClick={e => { e.stopPropagation(); fileRef.current?.click(); }} disabled={loading}>
                {loading ? (
                  <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 18 }}>progress_activity</span> Menginspeksi Skema Data…</>
                ) : (
                  <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>folder_open</span> Jelajahi File Komputer</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 1: Smart AI Schema Mapping ── */}
        {step === 1 && (
          <div className="animate-fadein space-y-6">
            {/* Classification & Confidence Banner */}
            <div className="glass-panel" style={{ padding: 20, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(76,215,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: 24 }}>psychology</span>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--on-surface)' }}>
                      Hasil Inspeksi Skema: {file?.name}
                    </span>
                    <span className={`badge ${classification?.format_type === 'EVENT_LOG' ? 'badge-analyzed' : 'badge-warn'}`}>
                      {classification?.format_type || 'EVENT_LOG'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--on-surface-variant)', marginTop: 2 }}>
                    {inspection?.total_rows?.toLocaleString()} baris · {inspection?.total_columns} kolom terdeteksi · Kepadatan Peristiwa: {classification?.event_density} events/case
                  </div>
                </div>
              </div>

              {/* Confidence Pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge badge-ready" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                  Metode: {mappingProposal?.mapping_method || 'AI_HYBRID'}
                </span>
                <span className="badge badge-analyzed" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                  Tingkat Keyakinan: {mappingProposal?.confidence_level || 'HIGH'}
                </span>
              </div>
            </div>

            {/* Graceful Failure Rejection Notice (if not process discoverable) */}
            {classification && !classification.is_process_discoverable && (
              <div style={{ padding: 24, borderRadius: 12, background: 'rgba(255,81,106,0.08)', border: '1px solid rgba(255,81,106,0.3)', color: 'var(--on-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, color: '#ff516a', fontWeight: 700, fontSize: '1rem' }}>
                  <span className="material-symbols-outlined">warning</span>
                  Dataset Tidak Dapat Diproses untuk Process Discovery
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--on-surface-variant)', lineHeight: 1.6, marginBottom: 14 }}>
                  {classification.rejection_reason}
                </p>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: 6 }}>
                  Analisis yang tetap tersedia untuk dataset ini:
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {classification.available_analysis?.map(a => (
                    <span key={a} className="badge badge-ready" style={{ fontSize: '0.7rem' }}>✓ {a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Column Mapping Grid */}
            <div className="glass-panel" style={{ padding: 24, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--on-surface)' }}>
                    Pemetaan Kolom ke Canonical Event Schema
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)' }}>
                    AI telah mencocokkan kolom secara otomatis berdasarkan nama, tipe data, dan statistik isi. Anda dapat mengubah pilihan di bawah ini:
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {REQUIRED_FIELDS.map(f => {
                  const currentVal = mapping[f.key] || '';
                  const colInfo = inspection?.columns?.find(c => c.name === currentVal);

                  return (
                    <div
                      key={f.key}
                      style={{
                        display: 'grid', gridTemplateColumns: '260px 1fr 1fr', gap: 16, alignItems: 'center',
                        padding: '14px 18px', background: 'var(--surface-container-low)', borderRadius: 10,
                        border: `1px solid ${currentVal ? 'rgba(192,193,255,0.25)' : 'var(--border-glass)'}`
                      }}
                    >
                      {/* Left: Role Info */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>{f.icon}</span>
                          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--on-surface)' }}>{f.label}</span>
                          {f.required && <span style={{ color: '#ff516a', fontWeight: 700 }}>*</span>}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)', marginTop: 2 }}>{f.desc}</div>
                      </div>

                      {/* Middle: Select Dropdown */}
                      <div>
                        <select
                          className="form-select"
                          value={currentVal}
                          onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                          style={{ width: '100%', fontSize: '0.85rem' }}
                        >
                          <option value="">— Pilih Kolom Sumber —</option>
                          {columns.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      {/* Right: Sample preview chip */}
                      <div style={{ minWidth: 0 }}>
                        {colInfo ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--outline)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span className="badge badge-ready" style={{ fontSize: '0.65rem', flexShrink: 0 }}>{colInfo.dtype}</span>
                            <span>Sampel: <strong>{colInfo.sample_values?.slice(0, 3).join(', ')}</strong></span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--outline)' }}>Belum dipetakan</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Multiple Timestamps Disambiguation Note (if detected) */}
              {mappingProposal?.timestamp_candidates?.length > 1 && (
                <div style={{ marginTop: 20, padding: 14, background: 'rgba(76,215,246,0.08)', borderRadius: 8, border: '1px solid rgba(76,215,246,0.2)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--secondary)', marginBottom: 4 }}>
                    ℹ Terdeteksi Beberapa Kolom Waktu:
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                    {mappingProposal.timestamp_candidates.map(tc => (
                      <span key={tc.column} style={{ padding: '2px 8px', background: 'var(--surface-container)', borderRadius: 4 }}>
                        {tc.column} ({tc.inferred_role})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button className="btn btn-secondary" onClick={() => setStep(0)}>Kembali</button>
                <button className="btn btn-primary" onClick={handleContinueToQuality} disabled={loading || !requiredMapped}>
                  {loading ? (
                    <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 18 }}>progress_activity</span> Memvalidasi Skema…</>
                  ) : (
                    <>Lanjut ke Matriks Kapabilitas <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span></>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Capability Matrix & Quality Assessment ── */}
        {step === 2 && (
          <div className="animate-fadein space-y-6">
            <div className="glass-panel" style={{ padding: 24, borderRadius: 12 }}>
              <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: 600, color: 'var(--on-surface)', marginBottom: 8 }}>
                Penilaian Kualitas & Matriks Kapabilitas Data
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--on-surface-variant)', marginBottom: 24 }}>
                Tingkat kecocokan dataset Anda terhadap fitur analisis FlowMind:
              </p>

              {/* Compatibility Level Card */}
              <div style={{ padding: 20, background: 'var(--surface-container-low)', borderRadius: 12, border: '1px solid var(--border-glass)', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>
                      {capabilities?.compatibility_level_label || 'Level 2 — Enriched'}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--outline)', marginLeft: 8 }}>
                      (Skor Kompatibilitas: {capabilities?.compatibility_score || 92}%)
                    </span>
                  </div>
                  <span className="badge badge-analyzed">SIAP DIPROSES</span>
                </div>
                <div className="kpi-progress" style={{ height: 8 }}>
                  <div className="kpi-progress-fill emerald" style={{ width: `${capabilities?.compatibility_score || 92}%` }} />
                </div>
              </div>

              {/* Two Column Grid: Supported Features vs Limited Features */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                {/* Supported */}
                <div style={{ padding: 18, background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--compliance-emerald)', marginBottom: 12 }}>
                    ✓ Fitur Analisis yang Sepenuhnya Aktif
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {capabilities?.supported?.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.825rem', color: 'var(--on-surface)' }}>
                        <span className="material-symbols-outlined text-emerald" style={{ fontSize: 16 }}>check_circle</span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Limited / Unavailable */}
                <div style={{ padding: 18, background: 'var(--surface-container)', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 12 }}>
                    ℹ Fitur Tambahan (Opsional)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {capabilities?.limited?.map(l => (
                      <div key={l.feature} style={{ fontSize: '0.8rem' }}>
                        <div style={{ color: 'var(--tertiary)', fontWeight: 600 }}>⚠ {l.feature}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--outline)', marginTop: 2 }}>{l.reason}</div>
                      </div>
                    ))}
                    {capabilities?.unavailable?.map(u => (
                      <div key={u.feature} style={{ fontSize: '0.8rem' }}>
                        <div style={{ color: 'var(--outline)' }}>○ {u.feature}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--outline)', marginTop: 2 }}>{u.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button className="btn btn-secondary" onClick={() => setStep(1)}>Kembali</button>
                <button className="btn btn-primary" onClick={() => setStep(3)}>
                  Lanjut ke Konfirmasi <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Finalize & Run Analysis ── */}
        {step === 3 && (
          <div className="animate-fadein space-y-6">
            <div className="glass-panel" style={{ padding: 28, borderRadius: 12, maxWidth: 680, margin: '0 auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(192, 193, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }}>rocket_launch</span>
                </div>
                <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.3rem', fontWeight: 700, color: 'var(--on-surface)', marginBottom: 6 }}>
                  Konfirmasi Transformasi & Jalankan Analisis
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--on-surface-variant)' }}>
                  Data akan ditransformasikan ke <em>Canonical Event Model</em> dan langsung diekstraksi ke Process Discovery Engine.
                </p>
              </div>

              {/* SLA Target Configuration */}
              <div className="form-group" style={{ marginBottom: 24, padding: 18, background: 'var(--surface-container-low)', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0, fontWeight: 700 }}>Target Batas Waktu SLA (Jam)</label>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {slaHours} jam ({roundDays(slaHours)})
                  </span>
                </div>
                <input
                  type="range"
                  min={4} max={168} step={4}
                  value={slaHours}
                  onChange={e => setSlaHours(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)', marginTop: 8 }}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--outline)', marginTop: 6 }}>
                  Target waktu maksimal penyelesaian satu siklus kasus ujung-ke-ujung.
                </div>
              </div>

              {/* Run Button */}
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleFinalize}
                disabled={loading}
              >
                {loading ? (
                  <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 20 }}>progress_activity</span> Mentransformasikan Data & Menemukan Model Proses…</>
                ) : (
                  <><span className="material-symbols-outlined" style={{ fontSize: 20 }}>play_arrow</span> Jalankan Process Discovery Sekarang</>
                )}
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function roundDays(hours) {
  if (hours >= 24) {
    return `${(hours / 24).toFixed(1)} hari`;
  }
  return `${hours} jam`;
}
