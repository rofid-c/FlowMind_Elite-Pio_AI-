import { useState, useRef, useEffect } from 'react';
import api from '../api/client';

const SUGGESTIONS = [
  'Why is this process slow?',
  'Which transition contributes most to delays?',
  'Which activities are potential automation candidates?',
  'What explains the SLA violations?',
  'Which process variant performs worst?'
];

const INITIAL_BOT_MESSAGE = {
  id: 'init',
  role: 'bot',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  data: {
    answer_type: 'DIAGNOSIS',
    summary: "Berdasarkan analisis event log proses yang terverifikasi, saya mendeteksi beberapa anomali struktural pada alur kerja. Berikut adalah dekonstruksi akar masalah dan bukti terukur.",
    facts: [
      { text: "Volume transaksi yang memerlukan ulasan manual menyumbang deviasi durasi tertinggi.", evidence_ids: ["EV-001"] },
      { text: "Terdapat variasi waktu tunggu signifikan pada transisi ulasan menuju persetujuan.", evidence_ids: ["EV-002"] }
    ],
    evidence: [
      {
        id: "EV-001",
        metric: "Median Waktu Siklus (P50)",
        value: "10.0 jam (P90: 26.6 jam)",
        query: "SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY cycle_time_hours)\nFROM process_cases\nWHERE status = 'COMPLETED';"
      },
      {
        id: "EV-002",
        metric: "Transisi 'Review → Approve'",
        value: "Median: 5.5 jam, Frekuensi: 5x",
        query: "SELECT source_activity, target_activity, median(elapsed_hours)\nFROM transition_events\nWHERE source_activity = 'Review' AND target_activity = 'Approve'\nGROUP BY 1, 2;"
      }
    ],
    interpretations: [
      { text: "Lonjakan durasi ulasan bukan disebabkan oleh volume beban semata, melainkan waktu tunggu antrean petugas dan perlunya verifikasi dokumen tambahan.", evidence_ids: ["EV-001", "EV-002"] }
    ],
    hypotheses: [
      { text: "Kapasitas pemeriksa pada jam-jam puncak belum teralokasi secara optimal, menyebabkan antrean approval menumpuk.", evidence_ids: [] }
    ],
    recommendations: [
      { text: "Investigasi kapasitas dan antrean pada transisi Review → Approve", action_type: "INVESTIGASI", evidence_ids: ["EV-002"] },
      { text: "Evaluasi simulasi pemotongan waktu approval pada menu Skenario What-If", action_type: "EVALUASI", evidence_ids: ["EV-001"] }
    ],
    limitations: [
      "Analisis terbatas pada log aktivitas sistem. Komunikasi di luar sistem (email/chat) tidak tercatat dalam dataset."
    ],
    follow_up_questions: [
      "Di mana titik hambatan terbesar?",
      "Varian jalur mana yang paling lambat?",
      "Apa rekomendasi perbaikan spesifik?"
    ]
  }
};

function createNewSession(customTitle = 'Sesi Baru') {
  return {
    id: `sess_${Date.now()}`,
    title: customTitle,
    createdAt: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    messages: [{ ...INITIAL_BOT_MESSAGE, id: `init_${Date.now()}` }]
  };
}

// ── SUB-COMPONENTS ─────────────────────────────────────────────────────────

function EvidenceChip({ id }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '1px 6px',
      borderRadius: 4, background: 'var(--surface-bright)',
      border: '1px solid var(--border-glass)', color: 'var(--compliance-emerald)',
      fontSize: '0.63rem', fontWeight: 700, fontFamily: 'Inter, monospace',
      marginLeft: 4, cursor: 'default'
    }}>[{id}]</span>
  );
}

function BentoFacts({ facts }) {
  if (!facts?.length) return null;
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: 'rgba(16, 185, 129, 0.05)',
      border: '1px solid rgba(16, 185, 129, 0.25)',
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'rgba(16,185,129,0.08)', filter: 'blur(30px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--compliance-emerald)' }}>fact_check</span>
        <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem', fontWeight: 700, color: 'var(--compliance-emerald)' }}>Fakta Terverifikasi</span>
      </div>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', position: 'relative' }}>
        {facts.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.78rem', color: 'var(--on-surface)', lineHeight: 1.55 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--compliance-emerald)', marginTop: 6, flexShrink: 0 }} />
            <span>
              {f.text || f}
              {f.evidence_ids?.map(eid => <EvidenceChip key={eid} id={eid} />)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BentoInterpretations({ interps }) {
  if (!interps?.length) return null;
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: 'rgba(76, 215, 246, 0.05)',
      border: '1px solid rgba(76, 215, 246, 0.25)',
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'rgba(76,215,246,0.08)', filter: 'blur(30px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--secondary)' }}>insights</span>
        <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem', fontWeight: 700, color: 'var(--secondary)' }}>Interpretasi Operasional</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
        {interps.map((inp, i) => (
          <p key={i} style={{ fontSize: '0.78rem', color: 'var(--on-surface-variant)', lineHeight: 1.55 }}>
            {inp.text || inp}
          </p>
        ))}
      </div>
    </div>
  );
}

function BentoHypotheses({ causes }) {
  if (!causes?.length) return null;
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: 'rgba(255, 180, 50, 0.05)',
      border: '1px solid rgba(255, 180, 50, 0.22)',
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'rgba(245,158,11,0.08)', filter: 'blur(30px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#f59e0b' }}>lightbulb</span>
        <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b' }}>Hipotesis (Unproven)</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
        {causes.map((pc, i) => {
          const txt = typeof pc === 'string' ? pc : (pc.text || pc);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '8px 12px', borderRadius: 8,
              background: 'rgba(23, 31, 51, 0.5)',
              border: '1px solid var(--border-glass)'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--outline)', marginTop: 1 }}>help</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--on-surface)', lineHeight: 1.55 }}>{txt}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceMetrics({ list }) {
  if (!list?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {list.map((ev, i) => (
        <div key={i} style={{
          padding: '6px 12px', borderRadius: 8,
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--compliance-emerald)' }}>fact_check</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)' }}>{ev.metric || ev.id}:</span>
          <strong style={{ fontSize: '0.72rem', color: 'var(--compliance-emerald)', fontFamily: 'Inter, monospace' }}>{String(ev.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function RecommendationChips({ recs, primaryRec, onSend }) {
  if (!recs?.length && !primaryRec) return null;
  return (
    <div>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--outline)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--primary)' }}>recommend</span>
        <span>REKOMENDASI TINDAKAN</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {recs.length > 0 ? recs.map((r, i) => {
          const rText = r.text || r;
          const rType = r.action_type || 'INVESTIGASI';
          const accentColor = rType === 'EVALUASI' ? 'var(--secondary)' : 'var(--primary)';
          return (
            <button
              key={i}
              className="glass-panel"
              onClick={() => onSend(`Jelaskan lebih lanjut rekomendasi: ${rText}`)}
              style={{
                padding: '7px 14px', borderRadius: 999, border: '1px solid var(--border-glass)',
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                transition: 'all 0.18s ease', background: 'transparent'
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = accentColor; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-glass)'; }}
            >
              <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(192,193,255,0.15)', color: accentColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {rType}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--on-surface)' }}>{rText}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--outline)' }}>arrow_forward</span>
            </button>
          );
        }) : primaryRec ? (
          <div className="glass-panel" style={{ padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', color: 'var(--on-surface)' }}>{primaryRec}</div>
        ) : null}
      </div>
    </div>
  );
}

function LimitationsBlock({ limits }) {
  if (!limits?.length) return null;
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8,
      background: 'rgba(11,19,38,0.5)',
      border: '1px dashed var(--border-glass)',
      display: 'flex', alignItems: 'flex-start', gap: 8
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--outline)', marginTop: 1 }}>info</span>
      <div style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--outline)', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.06em' }}>Batasan Observasi: </strong>
        {limits.join(' ')}
      </div>
    </div>
  );
}

export default function AIAnalystView({ projectId }) {
  const sessionsStorageKey = `flowmind_ai_sessions_${projectId || 'default'}`;

  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem(sessionsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [createNewSession('Sesi Pertama')];
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    return sessions[0]?.id || 'sess_1';
  });

  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  // Sync sessions with project change
  useEffect(() => {
    try {
      const saved = localStorage.getItem(sessionsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
          return;
        }
      }
    } catch {}
    const fresh = [createNewSession('Sesi Baru')];
    setSessions(fresh);
    setActiveSessionId(fresh[0].id);
  }, [projectId, sessionsStorageKey]);

  // Persist sessions
  useEffect(() => {
    try {
      localStorage.setItem(sessionsStorageKey, JSON.stringify(sessions));
    } catch {}
  }, [sessions, sessionsStorageKey]);

  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const messages = currentSession?.messages || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleNewSession = () => {
    const newSess = createNewSession(`Sesi ${sessions.length + 1}`);
    setSessions(prev => [newSess, ...prev]);
    setActiveSessionId(newSess.id);
    setAttachedFile(null);
    setInput('');
  };

  const handleDeleteSession = (sessIdToDelete, e) => {
    e?.stopPropagation();
    if (sessions.length === 1) {
      if (window.confirm("Reset percakapan pada sesi ini?")) {
        const fresh = [createNewSession('Sesi Baru')];
        setSessions(fresh);
        setActiveSessionId(fresh[0].id);
      }
      return;
    }

    if (window.confirm("Hapus sesi percakapan ini?")) {
      const remaining = sessions.filter(s => s.id !== sessIdToDelete);
      setSessions(remaining);
      if (activeSessionId === sessIdToDelete) {
        setActiveSessionId(remaining[0].id);
      }
    }
  };

  const handleClearAllHistory = () => {
    if (window.confirm("Hapus semua riwayat sesi Pio_AI untuk proyek ini?")) {
      const fresh = [createNewSession('Sesi Baru')];
      setSessions(fresh);
      setActiveSessionId(fresh[0].id);
      setShowHistoryDrawer(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachedFile({
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        content: event.target.result,
        type: file.type
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSend = async (text) => {
    const q = text || input.trim();
    if ((!q && !attachedFile) || loading) return;
    setInput('');

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: q || `Lampiran file: ${attachedFile?.name}`,
      timestamp: timeStr,
      attachedFile: attachedFile ? { name: attachedFile.name, size: attachedFile.size } : null
    };

    const filePayload = attachedFile ? {
      file_context: attachedFile.content,
      file_name: attachedFile.name
    } : {};

    const sentFile = attachedFile;
    setAttachedFile(null);

    const isFirstQuestion = messages.filter(m => m.role === 'user').length === 0;
    const sessionTitle = isFirstQuestion ? (q.length > 28 ? q.substring(0, 28) + '…' : q) : currentSession.title;

    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          title: sessionTitle,
          messages: [...s.messages, userMsg]
        };
      }
      return s;
    }));

    setLoading(true);

    try {
      const res = await api.askAI(projectId, {
        question: q || `Analisis file terlampir ${sentFile?.name}`,
        ...filePayload
      });

      const botMsg = {
        id: Date.now() + 1,
        role: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        data: res.data
      };

      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            messages: [...s.messages, botMsg]
          };
        }
        return s;
      }));
    } catch (e) {
      const errBotMsg = {
        id: Date.now() + 1,
        role: 'bot',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        data: {
          answer_type: 'ERROR',
          summary: `Mohon maaf, terjadi kendala saat memproses pertanyaan Anda: ${e.message}`,
          facts: [],
          evidence: [],
          interpretations: [],
          hypotheses: [],
          recommendations: []
        }
      };

      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return { ...s, messages: [...s.messages, errBotMsg] };
        }
        return s;
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fadein" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Atmospheric background glow */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden', borderRadius: 12 }}>
        <div style={{ position: 'absolute', top: '-5%', left: '-5%', width: '40%', height: '40%', borderRadius: '50%', background: 'var(--primary)', opacity: 0.04, filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '-5%', right: '-5%', width: '40%', height: '40%', borderRadius: '50%', background: 'var(--secondary)', opacity: 0.04, filter: 'blur(80px)' }} />
      </div>

      {/* ── MAIN WORKSPACE ── */}
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0, position: 'relative', zIndex: 1 }}>

        {/* 1. History Drawer */}
        {showHistoryDrawer && (
          <div
            className="surface-card animate-fadein"
            style={{ width: 256, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 20, flexShrink: 0 }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: 'var(--on-surface)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--secondary)' }}>history</span>
                <span>Sesi Tersimpan</span>
                <span style={{ padding: '0px 5px', borderRadius: 4, background: 'var(--surface-bright)', border: '1px solid var(--border-glass)', color: 'var(--outline)', fontSize: '0.65rem' }}>{sessions.length}</span>
              </div>
              <button
                onClick={() => setShowHistoryDrawer(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--outline)', cursor: 'pointer', fontSize: '0.8rem', padding: 2, lineHeight: 1 }}
              >✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {sessions.map(s => {
                const isActive = s.id === activeSessionId;
                const userCount = s.messages.filter(m => m.role === 'user').length;
                return (
                  <div
                    key={s.id}
                    onClick={() => { setActiveSessionId(s.id); setShowHistoryDrawer(false); }}
                    style={{
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      background: isActive ? 'rgba(192,193,255,0.1)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(192,193,255,0.35)' : 'var(--border-glass)'}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--primary)' : 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--outline)', marginTop: 1 }}>
                        {s.createdAt} · {userCount} pesan
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--outline)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                      title="Hapus sesi"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={handleClearAllHistory} style={{ background: 'transparent', border: 'none', color: '#ff7387', fontSize: '0.68rem', cursor: 'pointer' }}>
                Hapus Semua
              </button>
              <button onClick={() => { handleNewSession(); setShowHistoryDrawer(false); }} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                + Sesi Baru
              </button>
            </div>
          </div>
        )}

        {/* 2. Central Chat Stream */}
        <div
          style={{ flex: 1, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
        >
          
          {/* ── Chat Header Bar ── */}
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border-glass)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(76,215,246,0.25)'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: '#060e20', fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.95rem', fontWeight: 700, color: 'var(--on-surface)' }}>Pio_AI</span>
                  <span style={{
                    fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4,
                    background: 'var(--surface-bright)', border: '1px solid var(--border-glass)',
                    color: 'var(--on-surface-variant)', fontFamily: 'Inter, monospace'
                  }}>v0.2.0</span>
                </div>
                <p style={{ fontSize: '0.67rem', color: 'var(--on-surface-variant)', marginTop: 0 }}>
                  Automated Root Cause &amp; Process Intelligence Analyst
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={handleNewSession}
                className="btn btn-secondary btn-sm"
                title="Mulai Sesi Baru"
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: '0.73rem', fontWeight: 600 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--primary)' }}>add</span>
                <span>Sesi Baru</span>
              </button>

              <button
                onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
                className={`btn btn-sm ${showHistoryDrawer ? 'btn-primary' : 'btn-secondary'}`}
                title="Riwayat Sesi"
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: '0.73rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>history</span>
                <span>Riwayat ({sessions.length})</span>
              </button>

              <button
                onClick={() => handleDeleteSession(activeSessionId)}
                className="btn btn-secondary btn-sm"
                title="Hapus Sesi Aktif"
                style={{ padding: '5px 8px', color: '#ff7387' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
              </button>
            </div>
          </div>
          
          {/* ── Messages Scroll View ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {messages.map(m => {
              if (m.role === 'user') {
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ maxWidth: '72%', padding: '12px 16px', borderRadius: '14px 14px 0 14px', background: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(192, 193, 255, 0.22)', color: 'var(--on-surface)', fontSize: '0.875rem', lineHeight: 1.55 }}>
                      {m.attachedFile && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', marginBottom: 8, fontSize: '0.72rem', color: 'var(--secondary)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>attach_file</span>
                          <span>{m.attachedFile.name}</span>
                        </div>
                      )}
                      <div>{m.content}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--outline)', textAlign: 'right', marginTop: 4 }}>{m.timestamp}</div>
                    </div>
                  </div>
                );
              }

              // Pio_AI Response (Stitch Bento-Grid Layout)
              const data = m.data || {};
              const summaryText = data.summary || data.answer || '';
              const facts = data.facts || [];
              const interps = data.interpretations || [];
              const hypos = data.hypotheses || [];
              const possibleCauses = data.possible_causes || hypos.map(h => h.text || h);
              const recs = data.recommendations || [];
              const primaryRec = data.recommendation;
              const limits = data.limitations || (data.uncertainty ? [data.uncertainty] : []);
              const followUps = data.follow_up_questions || [];
              const evidenceList = data.evidence || [];

              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: '97%', animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>

                  {/* AI intro header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0, marginTop: 2,
                      background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 14px rgba(76,215,246,0.25)'
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#060e20', fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                    </div>
                    <p style={{ fontSize: '0.88rem', color: 'var(--on-surface)', lineHeight: 1.65, fontWeight: 400 }}>
                      {summaryText}
                    </p>
                  </div>

                  {/* Evidence metrics row */}
                  {evidenceList.length > 0 && (
                    <div style={{ marginLeft: 46 }}>
                      <EvidenceMetrics list={evidenceList} />
                    </div>
                  )}

                  {/* Bento Grid: Facts + Interpretations */}
                  {(facts.length > 0 || interps.length > 0) && (
                    <div style={{ marginLeft: 46, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                      <BentoFacts facts={facts} />
                      <BentoInterpretations interps={interps} />
                    </div>
                  )}

                  {/* Hypotheses — full width */}
                  {possibleCauses.length > 0 && (
                    <div style={{ marginLeft: 46 }}>
                      <BentoHypotheses causes={possibleCauses} />
                    </div>
                  )}

                  {/* Recommendations */}
                  {(recs.length > 0 || primaryRec) && (
                    <div style={{ marginLeft: 46 }}>
                      <RecommendationChips recs={recs} primaryRec={primaryRec} onSend={handleSend} />
                    </div>
                  )}

                  {/* Follow-up questions from API as clickable chips */}
                  {followUps.length > 0 && (
                    <div style={{ marginLeft: 46, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {followUps.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(q)}
                          disabled={loading}
                          style={{
                            padding: '4px 12px', borderRadius: 999,
                            background: 'var(--surface-container)',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--on-surface-variant)', fontSize: '0.73rem',
                            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s'
                          }}
                          onMouseOver={e => { e.currentTarget.style.color = 'var(--on-surface)'; e.currentTarget.style.borderColor = 'rgba(192,193,255,0.4)'; }}
                          onMouseOut={e => { e.currentTarget.style.color = 'var(--on-surface-variant)'; e.currentTarget.style.borderColor = 'var(--border-glass)'; }}
                        >
                          "{q}"
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Limitations */}
                  {limits.length > 0 && (
                    <div style={{ marginLeft: 46 }}>
                      <LimitationsBlock limits={limits} />
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginLeft: 46 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: 18, color: '#060e20' }}>progress_activity</span>
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--on-surface-variant)' }}>
                  Pio_AI sedang menganalisis log proses &amp; memvalidasi bukti…
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── BOTTOM INPUT BAR ── */}
          <div style={{
            padding: '12px 16px 16px',
            borderTop: '1px solid var(--border-glass)',
            flexShrink: 0
          }}>
            {/* Attached File Preview Pill */}
            {attachedFile && (
              <div style={{
                padding: '4px 12px', background: 'rgba(76,215,246,0.08)',
                borderRadius: 6, marginBottom: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: '0.73rem', color: 'var(--secondary)'
              }}>
                <span>📎 {attachedFile.name} ({attachedFile.size})</span>
                <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', color: 'var(--outline)', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            )}

            {/* Input Row with auto-resize textarea */}
            <div
              className="glass-panel"
              style={{ padding: '6px 8px 6px 12px', borderRadius: 12, display: 'flex', alignItems: 'flex-end', gap: 8, background: 'rgba(30, 41, 59, 0.7)' }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                accept=".csv,.txt,.json,.log,.md,.pdf"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Lampirkan Dokumen Pendukung (CSV, PDF, TXT)"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: attachedFile ? 'var(--secondary)' : 'var(--outline)', flexShrink: 0, lineHeight: 1 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>attach_file</span>
              </button>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={loading}
                placeholder="Tanyakan pada Pio_AI untuk analisis lebih mendalam..."
                rows={1}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--on-surface)', fontSize: '0.85rem',
                  resize: 'none', overflowY: 'hidden', minHeight: 36, maxHeight: 120,
                  paddingTop: 8, paddingBottom: 6, lineHeight: 1.5,
                  fontFamily: 'Inter, sans-serif'
                }}
              />

              <button
                onClick={() => handleSend()}
                disabled={loading || (!input.trim() && !attachedFile)}
                style={{
                  width: 36, height: 36, borderRadius: 8, background: 'var(--primary)',
                  border: 'none', color: '#060e20', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: (loading || (!input.trim() && !attachedFile)) ? 'not-allowed' : 'pointer',
                  opacity: (loading || (!input.trim() && !attachedFile)) ? 0.45 : 1,
                  transition: 'opacity 0.15s', flexShrink: 0
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>send</span>
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--outline-variant)', letterSpacing: '0.03em' }}>
                Pio_AI v0.2 may produce inaccurate information about people, places, or facts.
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* fadeUp animation */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
