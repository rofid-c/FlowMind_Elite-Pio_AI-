import { useState } from 'react';
import { Upload, X, ChevronRight, CheckCircle, AlertTriangle, Loader2, Database } from 'lucide-react';
import api from '../api/client';

const STEPS = ['Upload File', 'Map Columns', 'Data Quality', 'Run Analysis'];

export default function DatasetImportModal({ projectId, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null); // { id, detected_columns, preview_rows }
  const [mapping, setMapping] = useState({ case_id: '', activity: '', timestamp: '', actor: '', department: '' });
  const [preview, setPreview] = useState(null);
  const [slaHours, setSlaHours] = useState(48);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileDrop = async (file) => {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const res = await api.uploadDataset(projectId, file);
      setUploadResult(res);
      // Pre-guess column mapping
      const cols = res.detected_columns || [];
      const guess = (keywords) => cols.find(c => keywords.some(k => c.toLowerCase().includes(k))) || '';
      setMapping({
        case_id: guess(['case_id', 'case', 'id', 'ticket', 'incident', 'complaint']),
        activity: guess(['activity', 'status', 'event', 'step', 'action']),
        timestamp: guess(['timestamp', 'time', 'date', 'created', 'start']),
        actor: guess(['actor', 'agent', 'user', 'assigned', 'operator', 'resource']),
        department: guess(['department', 'team', 'group', 'unit', 'division']),
      });
      setStep(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleFileDrop(file);
  };

  const handleMapSave = async () => {
    if (!mapping.case_id || !mapping.activity || !mapping.timestamp) {
      setError('Case ID, Activity, and Timestamp columns are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.saveMapping(uploadResult.id, mapping);
      const prev = await api.previewDataset(uploadResult.id);
      setPreview(prev);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAndAnalyze = async () => {
    setLoading(true);
    setError('');
    try {
      await api.confirmDataset(uploadResult.id);
      const analysis = await api.triggerAnalysis(uploadResult.id, { sla_hours: slaHours });
      onComplete(analysis);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const cols = uploadResult?.detected_columns || [];
  const scoreColor = !preview ? '#4b5e77' : preview.quality_score >= 85 ? 'var(--green)' : preview.quality_score >= 65 ? 'var(--yellow)' : 'var(--red)';

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box lg animate-fadein">
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">Import Dataset</div>
            <div className="flex gap-2 mt-2">
              {STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', fontSize: '0.65rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i < step ? 'var(--green)' : i === step ? 'var(--brand-indigo)' : 'var(--bg-elevated)',
                    color: i <= step ? 'white' : 'var(--text-muted)',
                    border: i === step ? '2px solid var(--brand-indigo-light)' : '2px solid transparent',
                    transition: 'all 0.3s ease'
                  }}>
                    {i < step ? <CheckCircle size={11} /> : i + 1}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: i === step ? 'var(--text-primary)' : 'var(--text-muted)' }}>{s}</span>
                  {i < STEPS.length - 1 && <ChevronRight size={10} color="var(--text-muted)" />}
                </div>
              ))}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {/* Error */}
          {error && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'var(--sev-critical-bg)', border: '1px solid var(--sev-critical-border)', borderRadius: 'var(--radius-md)', marginBottom: 16, fontSize: '0.8rem', color: 'var(--sev-critical)', alignItems: 'center' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {/* Step 0: Upload */}
          {step === 0 && (
            <label
              className={`drop-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFileDrop(e.dataTransfer.files[0]); }}
              htmlFor="file-input"
            >
              <input id="file-input" type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileInput} />
              {uploading ? (
                <>
                  <Loader2 size={40} className="animate-spin" color="var(--brand-indigo)" style={{ margin: '0 auto 12px' }} />
                  <div className="drop-zone-title">Uploading and inspecting file…</div>
                </>
              ) : (
                <>
                  <div className="drop-zone-icon"><Upload size={40} color="var(--brand-indigo)" style={{ margin: '0 auto' }} /></div>
                  <div className="drop-zone-title">Drag & drop your event log CSV or XLSX</div>
                  <div className="drop-zone-sub">Supports .csv, .xlsx files up to 500MB</div>
                  <button className="btn btn-primary btn-sm mt-4" type="button" style={{ pointerEvents: 'none' }}>Browse Files</button>
                </>
              )}
            </label>
          )}

          {/* Step 1: Map Columns */}
          {step === 1 && (
            <div>
              <p className="text-sm text-muted mb-4">Map your dataset columns to FlowMind fields. <strong className="text-secondary">Case ID, Activity, and Timestamp are required.</strong></p>
              <div className="grid-2">
                {[
                  { field: 'case_id', label: 'Case ID *', desc: 'Unique identifier per case' },
                  { field: 'activity', label: 'Activity *', desc: 'Process step or action name' },
                  { field: 'timestamp', label: 'Timestamp *', desc: 'Event date/time column' },
                  { field: 'actor', label: 'Actor (optional)', desc: 'Who performed the action' },
                  { field: 'department', label: 'Department (optional)', desc: 'Organizational unit' },
                ].map(({ field, label, desc }) => (
                  <div className="form-group" key={field}>
                    <label className="form-label">{label}</label>
                    <select className="form-select" value={mapping[field]} onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}>
                      <option value="">— Not mapped —</option>
                      {cols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
                <div className="text-secondary font-semibold mb-2">Detected Columns ({cols.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cols.map(c => <span key={c} className="badge" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-muted)', color: 'var(--text-secondary)' }}>{c}</span>)}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Data Quality Preview */}
          {step === 2 && preview && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="section-title">Data Quality Score</div>
                  <div className="section-sub">{preview.rows.toLocaleString()} rows · {preview.unique_cases.toLocaleString()} cases · {preview.unique_activities} activities</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '2.5rem', fontFamily: 'Outfit', fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{preview.quality_score}%</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Quality Score</div>
                </div>
              </div>
              <div className="quality-score-bar">
                <div className="quality-score-fill" style={{ width: `${preview.quality_score}%` }} />
              </div>

              <div className="grid-3 mt-4">
                {[
                  { label: 'Missing Timestamps', value: `${preview.missing_values?.timestamp ?? 0}%`, warn: (preview.missing_values?.timestamp ?? 0) > 2 },
                  { label: 'Duplicate Events', value: `${preview.potential_duplicates}%`, warn: preview.potential_duplicates > 5 },
                  { label: 'Invalid Timestamps', value: preview.invalid_timestamps, warn: preview.invalid_timestamps > 0 },
                ].map(({ label, value, warn }) => (
                  <div key={label} className="card-sm" style={{ borderColor: warn ? 'var(--sev-medium-border)' : 'var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: '1.2rem', fontFamily: 'Outfit', fontWeight: 700, color: warn ? 'var(--yellow)' : 'var(--green)' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="form-group mt-4">
                <label className="form-label">SLA Target (hours)</label>
                <input type="number" className="form-input" value={slaHours} min={1} onChange={e => setSlaHours(Number(e.target.value))} style={{ maxWidth: 180 }} />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Cases exceeding this duration will be flagged as SLA violations.</div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step > 0 && step < 3 && <button className="btn btn-secondary" onClick={() => { setError(''); setStep(s => s - 1); }}>Back</button>}
          {step === 0 && <button className="btn btn-secondary" onClick={onClose}>Cancel</button>}
          {step === 1 && (
            <button className="btn btn-primary" onClick={handleMapSave} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              Preview Data Quality
            </button>
          )}
          {step === 2 && (
            <button className="btn btn-primary btn-lg" onClick={handleConfirmAndAnalyze} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
              {loading ? 'Analyzing...' : 'Confirm & Run Analysis'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
