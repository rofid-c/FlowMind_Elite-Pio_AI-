import { useState } from 'react';

const STEP_COLORS = [
  { bg: 'rgba(192, 193, 255, 0.12)', border: 'rgba(192, 193, 255, 0.3)', text: 'var(--primary)' },
  { bg: 'rgba(76, 215, 246, 0.12)', border: 'rgba(76, 215, 246, 0.3)', text: 'var(--secondary)' },
  { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', text: 'var(--compliance-emerald)' },
  { bg: 'rgba(255, 178, 183, 0.12)', border: 'rgba(255, 178, 183, 0.3)', text: 'var(--tertiary)' },
  { bg: 'rgba(255, 81, 106, 0.12)', border: 'rgba(255, 81, 106, 0.3)', text: 'var(--tertiary-container)' },
];

export default function VariantsView({ variantsData }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [search, setSearch] = useState('');

  if (!variantsData) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <span className="material-symbols-outlined" style={{ fontSize: 32 }}>alt_route</span>
        </div>
        <div className="empty-title">Belum Ada Data Varian</div>
        <div className="empty-desc">Jalankan analisis untuk menemukan seluruh jalur eksekusi proses ujung-ke-ujung.</div>
      </div>
    );
  }

  const variants = variantsData.variants || [];
  const totalCases = variantsData.total_cases || variants.reduce((acc, v) => acc + (v.case_count || v.cases || 0), 0) || 1;

  const filtered = variants.filter(v => {
    if (!search) return true;
    const str = (v.activities || v.variant || '').toString().toLowerCase();
    return str.includes(search.toLowerCase()) || String(v.rank || '').includes(search);
  });

  const activeVariant = filtered[selectedIdx] || filtered[0] || variants[0];

  return (
    <div className="animate-fadein space-y-6">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h3 className="section-title">Penjelajah Varian Jalur (Variant Explorer)</h3>
          <p className="section-sub">
            {variants.length} pola jalur eksekusi unik teridentifikasi dari {totalCases.toLocaleString()} total kasus.
          </p>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-slate)', border: '1px solid var(--border-glass)', borderRadius: 8, padding: '6px 12px', gap: 8, width: 280 }}>
          <span className="material-symbols-outlined text-outline" style={{ fontSize: 18 }}>search</span>
          <input
            type="text"
            placeholder="Cari aktivitas dalam varian..."
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedIdx(0); }}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--on-surface)', fontSize: '0.8rem', width: '100%', fontFamily: 'Inter, sans-serif' }}
          />
          {search && (
            <button style={{ background: 'none', border: 'none', color: 'var(--outline)', cursor: 'pointer' }} onClick={() => setSearch('')}>✕</button>
          )}
        </div>
      </div>

      {/* Grid: Variant List (7 cols) + Selected Variant Details (5 cols) */}
      <div className="grid-12">
        {/* Left: Variant Cards List */}
        <div className="col-7" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.length === 0 ? (
            <div className="surface-card" style={{ padding: 32, textAlign: 'center', color: 'var(--on-surface-variant)' }}>
              Tidak ada varian yang cocok dengan pencarian "{search}"
            </div>
          ) : filtered.map((v, i) => {
            const isSelected = activeVariant?.rank === v.rank || (selectedIdx === i);
            const isHappyPath = (v.rank === 1 || i === 0) && !search;
            const casesCount = v.case_count || v.cases || 0;
            const pct = v.percentage ?? v.share_pct ?? ((casesCount / totalCases) * 100).toFixed(1);
            const duration = v.median_duration_hours || v.median_cycle_hours;
            const actList = v.activities || (typeof v.variant === 'string' ? v.variant.split(' -> ') : []);

            return (
              <div
                key={v.variant_id || v.rank || i}
                onClick={() => setSelectedIdx(i)}
                className="glass-panel rounded-xl"
                style={{
                  padding: 18, borderRadius: 12, cursor: 'pointer',
                  borderColor: isSelected ? 'var(--primary)' : isHappyPath ? 'rgba(16,185,129,0.3)' : undefined,
                  background: isSelected ? 'rgba(45, 52, 73, 0.7)' : undefined,
                  boxShadow: isSelected ? '0 0 20px rgba(192, 193, 255, 0.15)' : undefined,
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Card Top Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--on-surface)' }}>
                      Varian #{v.rank || i + 1}
                    </span>
                    {isHappyPath && (
                      <span className="badge badge-analyzed">
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>verified</span>
                        JALUR UTAMA (HAPPY PATH)
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)', fontFamily: 'Inter, monospace' }}>
                      {casesCount.toLocaleString()} kasus ({pct}%)
                    </span>
                    <span className="badge badge-ready" style={{ fontSize: '0.7rem' }}>
                      {duration ? `${duration} jam` : '—'}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ height: 4, background: 'var(--surface-container-highest)', borderRadius: 999, marginBottom: 14, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%', width: `${Math.min(100, parseFloat(pct) || 0)}%`,
                      background: isHappyPath ? 'var(--compliance-emerald)' : 'var(--primary)',
                      borderRadius: 999
                    }}
                  />
                </div>

                {/* Flow Path Badges */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  {actList.map((act, ai) => {
                    const col = STEP_COLORS[ai % STEP_COLORS.length];
                    return (
                      <div key={ai} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span
                          style={{
                            padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem',
                            fontWeight: 600, background: col.bg, border: `1px solid ${col.border}`,
                            color: col.text
                          }}
                        >
                          {act}
                        </span>
                        {ai < actList.length - 1 && (
                          <span className="material-symbols-outlined text-outline" style={{ fontSize: 13 }}>arrow_forward</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Detailed Variant Breakdown (5 cols) */}
        <div className="col-5">
          {activeVariant ? (
            (() => {
              const casesCount = activeVariant.case_count || activeVariant.cases || 0;
              const pct = activeVariant.percentage ?? activeVariant.share_pct ?? ((casesCount / totalCases) * 100).toFixed(1);
              const duration = activeVariant.median_duration_hours || activeVariant.median_cycle_hours;
              const p90Dur = activeVariant.p90_duration_hours || activeVariant.p90_cycle_hours;
              const actList = activeVariant.activities || (typeof activeVariant.variant === 'string' ? activeVariant.variant.split(' -> ') : []);

              return (
                <div className="glass-panel rounded-xl" style={{ padding: 24, borderRadius: 12, position: 'sticky', top: 88 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border-glass)' }}>
                    <h4 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 600, color: 'var(--on-surface)' }}>
                      Analisis Detail Varian #{activeVariant.rank || selectedIdx + 1}
                    </h4>
                    <span className="badge badge-ready">{actList.length} Tahapan</span>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div style={{ padding: 14, background: 'var(--surface-container)', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
                      <div className="kpi-label" style={{ marginBottom: 4 }}>Volume Kasus</div>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--on-surface)' }}>
                        {casesCount.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--compliance-emerald)', marginTop: 2 }}>
                        {pct}% dari seluruh kasus
                      </div>
                    </div>

                    <div style={{ padding: 14, background: 'var(--surface-container)', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
                      <div className="kpi-label" style={{ marginBottom: 4 }}>Median Durasi</div>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary)' }}>
                        {duration ? `${duration} jam` : '—'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)', marginTop: 2 }}>
                        P90: {p90Dur ? `${p90Dur} jam` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Step by Step Timeline */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface-variant)', marginBottom: 12 }}>
                      Urutan Jejak Aktivitas (Sequential Trace)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {actList.map((act, ai) => (
                        <div
                          key={ai}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px', background: 'var(--surface-container-low)',
                            borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)'
                          }}
                        >
                          <div
                            style={{
                              width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-container-highest)',
                              color: 'var(--on-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.68rem', fontWeight: 700, flexShrink: 0
                            }}
                          >
                            {ai + 1}
                          </div>
                          <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--on-surface)', flex: 1 }}>{act}</span>
                          {ai === 0 && <span className="badge badge-analyzed" style={{ fontSize: '0.6rem' }}>MULAI</span>}
                          {ai === actList.length - 1 && (
                            <span className="badge badge-ready" style={{ fontSize: '0.6rem' }}>SELESAI</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="surface-card" style={{ padding: 32, textAlign: 'center', color: 'var(--on-surface-variant)' }}>
              Pilih salah satu varian untuk melihat detail mendalam.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
