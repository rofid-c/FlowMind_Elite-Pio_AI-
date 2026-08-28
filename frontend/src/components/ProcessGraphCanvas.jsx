import { useState, useRef } from 'react';

const NODE_WIDTH = 190;
const NODE_HEIGHT = 86;
const H_GAP = 120;
const V_GAP = 90;

function layoutNodes(nodes, edges) {
  if (!nodes || nodes.length === 0) return {};
  const outgoing = {};
  const incoming = {};
  nodes.forEach(n => { outgoing[n.id] = []; incoming[n.id] = []; });
  edges.forEach(e => {
    if (outgoing[e.source]) outgoing[e.source].push(e.target);
    if (incoming[e.target]) incoming[e.target].push(e.source);
  });

  const ranks = {};
  const queue = nodes.filter(n => n.is_start).map(n => n.id);
  if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0].id);
  queue.forEach(id => ranks[id] = 0);

  let idx = 0;
  while (idx < queue.length) {
    const id = queue[idx++];
    (outgoing[id] || []).forEach(nid => {
      if (ranks[nid] === undefined) {
        ranks[nid] = ranks[id] + 1;
        queue.push(nid);
      }
    });
  }

  nodes.forEach(n => { if (ranks[n.id] === undefined) ranks[n.id] = 0; });

  const rankGroups = {};
  nodes.forEach(n => {
    const r = ranks[n.id];
    if (!rankGroups[r]) rankGroups[r] = [];
    rankGroups[r].push(n.id);
  });

  const positions = {};
  const rankKeys = Object.keys(rankGroups).map(Number).sort((a, b) => a - b);
  rankKeys.forEach((rank) => {
    const group = rankGroups[rank];
    group.forEach((id, i) => {
      positions[id] = {
        x: rank * (NODE_WIDTH + H_GAP) + 80,
        y: i * (NODE_HEIGHT + V_GAP) + 120,
      };
    });
  });
  return positions;
}

export default function ProcessGraphCanvas({ graph, findings, onSimulateTransition }) {
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 20, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return (
      <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <div className="empty-icon">
          <span className="material-symbols-outlined" style={{ fontSize: 32 }}>account_tree</span>
        </div>
        <div className="empty-title">No Process Map Available</div>
        <div className="empty-desc">Upload a dataset and run an analysis to discover the process map.</div>
      </div>
    );
  }

  const positions = layoutNodes(graph.nodes, graph.edges);
  const maxFreq = Math.max(...graph.edges.map(e => e.frequency), 1);
  const maxWait = Math.max(...graph.edges.map(e => e.median_elapsed_hours), 0.001);
  const maxNodeFreq = Math.max(...graph.nodes.map(n => n.frequency), 1);

  // Default selection
  const activeEdge = selectedEdge || graph.edges.find(e => e.median_elapsed_hours >= maxWait * 0.4) || graph.edges[0];

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const handleMouseMove = (e) => {
    if (!panning) return;
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };
  const handleMouseUp = () => setPanning(false);
  const handleWheel = (e) => {
    e.preventDefault();
    setScale(s => Math.min(1.8, Math.max(0.4, s - e.deltaY * 0.001)));
  };

  const relatedFinding = (findings || []).find(f =>
    f.type === 'BOTTLENECK' &&
    activeEdge &&
    (f.title?.includes(activeEdge.source) || f.title?.includes(activeEdge.target))
  );

  return (
    <div
      className="flex-1 flex h-full w-full overflow-hidden relative"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Canvas Area */}
      <div
        className="map-canvas-area flex-1 h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      >
        {/* Floating Canvas Controls */}
        <div className="canvas-controls">
          <button className="canvas-ctrl-btn" title="Zoom In" onClick={() => setScale(s => Math.min(1.8, s + 0.15))}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>zoom_in</span>
          </button>
          <button className="canvas-ctrl-btn" title="Zoom Out" onClick={() => setScale(s => Math.max(0.4, s - 0.15))}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>zoom_out</span>
          </button>
          <div className="canvas-ctrl-divider" />
          <button className="canvas-ctrl-btn" title="Fit to Screen" onClick={() => { setScale(0.85); setPan({ x: 20, y: 0 }); }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>fit_screen</span>
          </button>
        </div>

        {/* Legend */}
        <div style={{
          position: 'absolute', top: 16, right: 16, zIndex: 20,
          background: 'rgba(23, 31, 51, 0.9)', backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-glass)', borderRadius: 9999,
          padding: '6px 18px', display: 'flex', alignItems: 'center', gap: 16,
          fontSize: '0.72rem', fontWeight: 600
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--compliance-emerald)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--compliance-emerald)', boxShadow: '0 0 6px rgba(16,185,129,0.5)' }} />
            Happy Path
          </div>
          <div style={{ width: 1, height: 12, background: 'var(--border-glass)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tertiary-container)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--tertiary-container)', boxShadow: '0 0 6px rgba(255,81,106,0.5)' }} />
            Bottleneck
          </div>
          <div style={{ width: 1, height: 12, background: 'var(--border-glass)' }} />
          <div style={{ color: 'var(--on-surface-variant)', fontFamily: 'Inter, monospace', fontSize: '0.68rem' }}>
            {graph.nodes.length} Nodes · {graph.edges.length} Edges
          </div>
        </div>

        {/* SVG Connections */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
          <defs>
            <linearGradient id="flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(128, 131, 255, 0.3)" />
              <stop offset="100%" stopColor="rgba(76, 215, 246, 0.7)" />
            </linearGradient>
            <linearGradient id="bottleneck-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255, 81, 106, 0.3)" />
              <stop offset="100%" stopColor="#ff516a" />
            </linearGradient>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
            {graph.edges.map((edge, i) => {
              const src = positions[edge.source];
              const tgt = positions[edge.target];
              if (!src || !tgt) return null;

              const isSelf = edge.source === edge.target;
              const isBottleneck = edge.median_elapsed_hours >= maxWait * 0.4;
              const isSelected = activeEdge?.source === edge.source && activeEdge?.target === edge.target;

              const sx = src.x + NODE_WIDTH;
              const sy = src.y + NODE_HEIGHT / 2;
              const tx = tgt.x;
              const ty = tgt.y + NODE_HEIGHT / 2;

              const d = isSelf
                ? `M ${sx} ${sy} C ${sx + 60} ${sy - 80}, ${tx + 60} ${ty - 80}, ${tx} ${ty}`
                : `M ${sx} ${sy} C ${sx + 60} ${sy}, ${tx - 60} ${ty}, ${tx} ${ty}`;

              return (
                <g key={i}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isBottleneck ? "url(#bottleneck-grad)" : "rgba(255, 255, 255, 0.08)"}
                    strokeWidth={isBottleneck ? 4.5 : Math.max(2, (edge.frequency / maxFreq) * 3.5)}
                    strokeLinecap="round"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={isBottleneck ? "#ff516a" : "#c0c1ff"}
                    strokeWidth={isSelected ? 3 : 1.5}
                    className="flow-path"
                    style={{
                      strokeDasharray: isBottleneck ? '6 4' : '4 4',
                      opacity: isSelected ? 1 : 0.8
                    }}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Nodes DOM Layer */}
        <div
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0'
          }}
        >
          {graph.nodes.map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;

            const isStart = node.is_start;
            const isEnd = node.is_end;
            const isSelected = selectedNode?.id === node.id;
            const isBottleneck = graph.edges.some(e => e.source === node.id && e.median_elapsed_hours >= maxWait * 0.4);

            const volPct = Math.min(100, Math.round((node.frequency / maxNodeFreq) * 100));

            return (
              <div
                key={node.id}
                className={`map-node ${isBottleneck ? 'bottleneck' : isStart || isEnd ? 'healthy' : ''}`}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  pointerEvents: 'auto',
                  borderColor: isSelected ? 'var(--primary)' : undefined,
                  boxShadow: isSelected ? '0 0 25px rgba(192, 193, 255, 0.3)' : undefined,
                }}
                onClick={() => {
                  setSelectedNode(node);
                  const outEdge = graph.edges.find(e => e.source === node.id);
                  if (outEdge) setSelectedEdge(outEdge);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="map-node-label" style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.label}
                  </span>
                  <div
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: isBottleneck ? 'var(--tertiary-container)' : isStart || isEnd ? 'var(--compliance-emerald)' : 'var(--secondary)',
                      boxShadow: isBottleneck ? '0 0 8px rgba(255,81,106,0.6)' : isStart || isEnd ? '0 0 8px rgba(16,185,129,0.6)' : undefined
                    }}
                  />
                </div>

                <div className="map-node-vol">
                  <span>Vol: {node.frequency?.toLocaleString()}</span>
                  <span style={{ color: isBottleneck ? 'var(--tertiary-container)' : 'var(--compliance-emerald)' }}>
                    {node.case_coverage_pct}%
                  </span>
                </div>

                <div className="map-node-bar">
                  <div
                    className="map-node-bar-fill"
                    style={{
                      width: `${volPct}%`,
                      background: isBottleneck ? 'linear-gradient(90deg, #ff516a, #ff9100)' : isStart || isEnd ? 'var(--compliance-emerald)' : 'var(--secondary)'
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Drawer: Transition Details */}
      <aside className="transition-drawer">
        <div className="drawer-header">
          <h3>Detail Transisi</h3>
          {activeEdge ? (
            <div className="drawer-transition-pill">
              <span style={{ color: 'var(--on-surface)', fontWeight: 600 }}>{activeEdge.source}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--outline)' }}>arrow_forward</span>
              <span style={{ color: activeEdge.median_elapsed_hours >= maxWait * 0.4 ? 'var(--tertiary-container)' : 'var(--primary)', fontWeight: 600 }}>
                {activeEdge.target}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>Klik garis transisi untuk memeriksa</div>
          )}
        </div>

        <div className="drawer-body">
          {activeEdge && (
            <>
              {/* Stats Grid */}
              <div className="drawer-stat-grid">
                <div className="drawer-stat">
                  <div className="drawer-stat-label">Frekuensi</div>
                  <div className="drawer-stat-value">{activeEdge.frequency?.toLocaleString()}</div>
                  <div className="drawer-stat-sub" style={{ color: 'var(--compliance-emerald)' }}>
                    {activeEdge.case_coverage_pct}% kasus
                  </div>
                </div>

                <div className={`drawer-stat ${activeEdge.median_elapsed_hours >= maxWait * 0.4 ? 'alert' : ''}`}>
                  <div className="drawer-stat-label">Median Waktu Tunggu</div>
                  <div className={`drawer-stat-value ${activeEdge.median_elapsed_hours >= maxWait * 0.4 ? 'alert' : ''}`}>
                    {activeEdge.median_elapsed_hours} jam
                  </div>
                  <div className="drawer-stat-sub">
                    P90: <span style={{ color: 'var(--on-surface)', fontWeight: 600 }}>{activeEdge.p90_elapsed_hours} jam</span>
                  </div>
                </div>
              </div>

              {/* Cycle Time Distribution Histogram */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>bar_chart</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--on-surface)' }}>
                    Distribusi Waktu Siklus
                  </span>
                </div>
                <div style={{
                  height: 140, background: 'rgba(11, 19, 38, 0.6)', borderRadius: 10,
                  border: '1px solid var(--border-glass)', padding: 14, display: 'flex',
                  alignItems: 'flex-end', gap: 6, position: 'relative'
                }}>
                  {[
                    { h: 20, col: 'rgba(192,193,255,0.3)', val: `${activeEdge.min_elapsed_hours}h` },
                    { h: 40, col: 'rgba(192,193,255,0.4)', val: `${(activeEdge.median_elapsed_hours * 0.5).toFixed(1)}h` },
                    { h: 65, col: 'rgba(192,193,255,0.6)', val: `${(activeEdge.median_elapsed_hours * 0.8).toFixed(1)}h` },
                    { h: 95, col: 'linear-gradient(to top, rgba(128,131,255,0.6), #c0c1ff)', val: `${activeEdge.median_elapsed_hours}h Median` },
                    { h: 75, col: 'rgba(192,193,255,0.5)', val: `${(activeEdge.median_elapsed_hours * 1.2).toFixed(1)}h` },
                    { h: 50, col: 'rgba(255,81,106,0.3)', val: `${(activeEdge.p90_elapsed_hours * 0.8).toFixed(1)}h` },
                    { h: 80, col: 'linear-gradient(to top, rgba(255,81,106,0.4), #ff516a)', val: `${activeEdge.p90_elapsed_hours}h P90` },
                    { h: 30, col: 'rgba(255,81,106,0.3)', val: `${activeEdge.max_elapsed_hours}h Max` },
                  ].map((bar, bi) => (
                    <div
                      key={bi}
                      title={bar.val}
                      style={{
                        flex: 1, height: `${bar.h}%`, background: bar.col,
                        borderRadius: '3px 3px 0 0', cursor: 'pointer', transition: 'opacity 0.15s'
                      }}
                      onMouseOver={e => e.currentTarget.style.opacity = '1'}
                      onMouseOut={e => e.currentTarget.style.opacity = '0.85'}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--outline)', marginTop: 6, fontFamily: 'Inter, monospace' }}>
                  <span>Min: {activeEdge.min_elapsed_hours} jam</span>
                  <span style={{ color: 'var(--on-surface)', fontWeight: 600 }}>Median: {activeEdge.median_elapsed_hours} jam</span>
                  <span>Maks: {activeEdge.max_elapsed_hours} jam</span>
                </div>
              </div>

              {/* AI Root Cause Insight Card */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.7)', border: '1px solid var(--border-glass)',
                borderRadius: 12, padding: 18, position: 'relative', overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(160,120,255,0.15)', border: '1px solid rgba(160,120,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--tertiary-container)' }}>psychology</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--on-surface)' }}>Analisis Akar Masalah AI</div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tingkat Keyakinan: 94%</div>
                  </div>
                </div>

                <p style={{ fontSize: '0.78rem', color: 'var(--on-surface-variant)', lineHeight: 1.5, marginBottom: 14 }}>
                  {relatedFinding ? (
                    <>
                      <strong style={{ color: 'var(--on-surface)', display: 'block', marginBottom: 2 }}>{relatedFinding.title}</strong>
                      {relatedFinding.what_observed}
                    </>
                  ) : (
                    <>
                      <strong style={{ color: 'var(--on-surface)', display: 'block', marginBottom: 2 }}>Terdeteksi Akumulasi Bottleneck.</strong>
                      Transisi ini membutuhkan waktu median {activeEdge.median_elapsed_hours} jam. Waktu antrean dan handoff antar tim menyumbang signifikan pada total durasi proses.
                    </>
                  )}
                </p>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm btn-full"
                    onClick={() => {
                      if (onSimulateTransition) onSimulateTransition(activeEdge);
                    }}
                  >
                    Simulasikan Perbaikan
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
