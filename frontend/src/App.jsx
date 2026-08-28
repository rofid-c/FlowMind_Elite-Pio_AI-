import { useState, useEffect, useCallback } from 'react';
import api from './api/client';
import OverviewView from './components/OverviewView';
import ProcessGraphCanvas from './components/ProcessGraphCanvas';
import MetricsView from './components/MetricsView';
import VariantsView from './components/VariantsView';
import FindingsView from './components/FindingsView';
import ScenarioView from './components/ScenarioView';
import AIAnalystView from './components/AIAnalystView';
import DatasetIngestionFlow from './components/DatasetIngestionFlow';

const NAV = [
  { id: 'overview',  label: 'Ringkasan',      icon: 'dashboard' },
  { id: 'map',       label: 'Peta Proses',    icon: 'account_tree' },
  { id: 'metrics',   label: 'Metrik',         icon: 'analytics' },
  { id: 'variants',  label: 'Varian Jalur',   icon: 'alt_route' },
  { id: 'findings',  label: 'Temuan Masalah', icon: 'troubleshoot' },
  { id: 'scenarios', label: 'Skenario What-If', icon: 'psychology' },
  { id: 'ai',        label: 'Pio_AI',         icon: 'neurology', accent: true },
];

const NAV_BOTTOM = [
  { id: 'settings', label: 'Pengaturan', icon: 'settings' },
  { id: 'help',     label: 'Bantuan',    icon: 'help' },
];

export default function App() {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('flowmind_active_tab') || 'overview');
  const [showIngestion, setShowIngestion] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjProcess, setNewProjProcess] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  // Analysis data
  const [analysisId, setAnalysisId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [graph, setGraph] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [variants, setVariants] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [prefilledScenario, setPrefilledScenario] = useState(null);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    localStorage.setItem('flowmind_active_tab', tabId);
  };

  const handleSimulateFromGraph = (edge) => {
    setPrefilledScenario({
      target: `${edge.source} -> ${edge.target}`,
      changeType: 'REDUCE_DURATION',
      name: `Optimasi Bottleneck ${edge.source} -> ${edge.target}`
    });
    handleTabChange('scenarios');
  };

  useEffect(() => {
    api.listProjects()
      .then(list => {
        setProjects(list);
        if (list.length > 0) {
          const savedId = localStorage.getItem('flowmind_active_project');
          const target = list.find(p => p.id === savedId) || list[0];
          setActiveProject(target);
          loadData(target.id);
        }
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async (projId) => {
    setLoadingData(true);
    try {
      localStorage.setItem('flowmind_active_project', projId);

      // 1. Instant load from existing database analysis if already completed
      const latest = await api.getLatestProjectAnalysis(projId).catch(() => null);
      if (latest?.analysis_id) {
        await fetchResults(latest.analysis_id, projId);
        setLoadingData(false);
        return;
      }

      // 2. Check if datasets exist
      const datasets = await api.listDatasets(projId).catch(() => []);
      if (!datasets?.length) {
        setSummary(null); setGraph(null); setMetrics(null); setVariants(null); setFindings([]); setAnalysisId(null);
        setLoadingData(false);
        return;
      }

      // 3. Check if dataset has a completed analysis
      const dsLatest = await api.getLatestDatasetAnalysis(datasets[0].id).catch(() => null);
      if (dsLatest?.analysis_id) {
        await fetchResults(dsLatest.analysis_id, projId);
        setLoadingData(false);
        return;
      }

      // 4. Only trigger new analysis if none exists yet
      const a = await api.triggerAnalysis(datasets[0].id, { sla_hours: 48 }).catch(() => null);
      if (a?.analysis_id) await fetchResults(a.analysis_id, projId);
    } catch {}
    setLoadingData(false);
  }, []);

  const fetchResults = async (aId, projId) => {
    setAnalysisId(aId);
    const pid = projId || activeProject?.id;
    const [sum, g, m, v, f] = await Promise.all([
      api.getAnalysisSummary(aId).catch(() => null),
      api.getProcessGraph(aId).catch(() => null),
      api.getMetrics(aId).catch(() => null),
      api.getVariants(aId).catch(() => null),
      (pid ? api.getProjectFindings(pid) : api.getAnalysisFindings(aId)).catch(() => []),
    ]);
    setSummary(sum); setGraph(g); setMetrics(m); setVariants(v); setFindings(f || []);
  };

  const handleIngestionComplete = async (info) => {
    setShowIngestion(false);
    setLoadingData(true);
    await fetchResults(info.analysis_id, activeProject?.id);
    const p = await api.getProject(activeProject.id).catch(() => activeProject);
    setActiveProject(p);
    setProjects(ps => ps.map(x => x.id === p.id ? p : x));
    setLoadingData(false);
    handleTabChange('overview');
  };

  const handleNewProject = async () => {
    if (!newProjName || !newProjProcess) return;
    const proj = await api.createProject({ name: newProjName, process_name: newProjProcess }).catch(() => null);
    if (!proj) return;
    setProjects(p => [proj, ...p]);
    setActiveProject(proj);
    localStorage.setItem('flowmind_active_project', proj.id);
    setNewProjName(''); setNewProjProcess('');
    setShowNewProject(false);
    setSummary(null); setGraph(null); setMetrics(null); setVariants(null); setFindings([]); setAnalysisId(null);
  };

  const handleDeleteProject = async (pToDelete, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete project "${pToDelete.name}"?\nAll associated datasets, discovery graphs, and findings will be removed.`)) {
      return;
    }

    setDeletingId(pToDelete.id);
    try {
      await api.deleteProject(pToDelete.id);
      const remaining = projects.filter(p => p.id !== pToDelete.id);
      setProjects(remaining);

      if (activeProject?.id === pToDelete.id) {
        if (remaining.length > 0) {
          setActiveProject(remaining[0]);
          loadData(remaining[0].id);
        } else {
          setActiveProject(null);
          setSummary(null); setGraph(null); setMetrics(null); setVariants(null); setFindings([]); setAnalysisId(null);
        }
      }
    } catch (err) {
      alert(`Failed to delete project: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Ingestion fullscreen flow
  if (showIngestion && activeProject) {
    return (
      <DatasetIngestionFlow
        projectId={activeProject.id}
        onClose={() => setShowIngestion(false)}
        onComplete={handleIngestionComplete}
      />
    );
  }

  const isCanvas = activeTab === 'map';
  const projectState = activeProject?.state || 'EMPTY';

  return (
    <div className="app-shell">
      {/* Ambient background */}
      <div className="ambient-bg" />

      {/* ── SIDEBAR ── */}
      <nav className="sidebar" style={{ zIndex: 40 }}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <img src="/logo.png" alt="FlowMind Elite" className="sidebar-logo-img" />
          </div>
          <div>
            <div className="sidebar-logo-title">FlowMind</div>
            <div className="sidebar-logo-sub">Process Intelligence</div>
          </div>
        </div>

        {/* Upload button */}
        <button
          className="btn-upload-sidebar"
          onClick={() => activeProject ? setShowIngestion(true) : setShowNewProject(true)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload</span>
          Unggah Dataset
        </button>

        {/* Nav items */}
        <ul className="nav-list">
          {NAV.map(({ id, label, icon, accent }) => (
            <li key={id}>
              <button
                className={`nav-item ${activeTab === id ? 'active' : ''}`}
                onClick={() => handleTabChange(id)}
              >
                <span
                  className="material-symbols-outlined"
                  style={accent && activeTab !== id ? { color: 'var(--secondary)' } : undefined}
                >
                  {icon}
                </span>
                <span style={accent && activeTab !== id ? { color: 'var(--secondary)' } : undefined}>
                  {label}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* Bottom nav */}
        <ul className="nav-section-bottom">
          {NAV_BOTTOM.map(({ id, label, icon }) => (
            <li key={id}>
              <button className="nav-item" onClick={() => id === 'settings' && setShowNewProject(true)}>
                <span className="material-symbols-outlined">{icon}</span>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── RIGHT SIDE WRAPPER ── */}
      <div style={{ marginLeft: 'var(--sidebar-width)', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: 'calc(100vw - var(--sidebar-width))', height: '100vh' }}>

        {/* ── TOPBAR ── */}
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Project selector */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewProject(true)}
                style={{ gap: 8 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {activeProject ? 'corporate_fare' : 'add_circle'}
                </span>
                <span className="topbar-title" style={{ fontSize: '1rem' }}>
                  {activeProject?.name || 'New Project'}
                </span>
                {activeProject && (
                  <span className={`badge badge-${projectState === 'ANALYZED' ? 'analyzed' : projectState === 'EMPTY' ? 'ready' : 'cyan'}`}>
                    {projectState}
                  </span>
                )}
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--outline)' }}>expand_more</span>
              </button>
            </div>
          </div>

          <div className="topbar-actions">
            {activeProject && (
              <button
                className="btn-icon"
                title="Delete Current Project"
                style={{ color: 'var(--tertiary-container)' }}
                onClick={(e) => handleDeleteProject(activeProject, e)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
              </button>
            )}
            <button className="btn btn-pill btn-pill-primary btn-sm" onClick={() => {
              if (activeProject && analysisId) fetchResults(analysisId);
            }}>
              Ready
            </button>
            <button className="btn btn-pill btn-pill-outline btn-sm">Share</button>
            <div className="divider-v" style={{ height: 24 }} />
            <button className="btn-icon">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>notifications</span>
            </button>
            <button className="btn-icon" style={{ overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>account_circle</span>
            </button>
          </div>
        </header>

        {/* ── MAIN VIEW ── */}
        {isCanvas ? (
          <div className="canvas-content">
            <ProcessGraphCanvas
              graph={graph}
              findings={findings}
              onSimulateTransition={handleSimulateFromGraph}
            />
          </div>
        ) : (
          <main className="main-content">
            {loadingData && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--on-surface-variant)' }}>
                <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 32 }}>progress_activity</span>
                <span>Memuat model inteligensi proses…</span>
              </div>
            )}

            {!loadingData && !activeProject && (
              <div className="empty-state" style={{ minHeight: 400 }}>
                <div className="empty-icon">
                  <span className="material-symbols-outlined" style={{ fontSize: 36 }}>folder_off</span>
                </div>
                <div className="empty-title">Belum Ada Proyek</div>
                <div className="empty-desc">Buat proyek proses bisnis pertama Anda untuk mulai menganalisis event log.</div>
                <button className="btn btn-primary" onClick={() => setShowNewProject(true)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                  Buat Proyek
                </button>
              </div>
            )}

            {!loadingData && activeProject && (
              <>
                {activeTab === 'overview'  && (
                  <OverviewView
                    summary={summary}
                    metrics={metrics}
                    graph={graph}
                    findings={findings}
                    onTabChange={handleTabChange}
                    projectName={activeProject?.name}
                    onUpload={() => setShowIngestion(true)}
                  />
                )}
                {activeTab === 'metrics'   && <MetricsView metrics={metrics} />}
                {activeTab === 'variants'  && <VariantsView variantsData={variants} />}
                {activeTab === 'findings'  && <FindingsView findings={findings} onSimulate={() => handleTabChange('scenarios')} />}
                {activeTab === 'scenarios' && (
                  <ScenarioView
                    projectId={activeProject?.id}
                    analysisId={analysisId}
                    metrics={metrics}
                    graph={graph}
                    prefilledScenario={prefilledScenario}
                  />
                )}
                {activeTab === 'ai'        && <AIAnalystView projectId={activeProject?.id} />}
              </>
            )}
          </main>
        )}
      </div>

      {/* ── PROJECT MANAGER & SWITCHER MODAL ── */}
      {showNewProject && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNewProject(false)}>
          <div className="modal-box animate-fadein" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <div className="modal-title">
                {projects.length === 0 ? 'Buat Proyek Pertama Anda' : 'Manajemen & Pilihan Proyek'}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewProject(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Existing projects list with Delete actions */}
              {projects.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span className="form-label" style={{ marginBottom: 0 }}>Daftar Proyek ({projects.length})</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--outline)' }}>Klik untuk memilih · Ikon tempat sampah untuk hapus</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                    {projects.map(p => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setActiveProject(p);
                          setShowNewProject(false);
                          loadData(p.id);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                          background: activeProject?.id === p.id ? 'rgba(192,193,255,0.1)' : 'var(--surface-container)',
                          border: `1px solid ${activeProject?.id === p.id ? 'rgba(192,193,255,0.4)' : 'var(--border-glass)'}`,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </span>
                            {activeProject?.id === p.id && (
                              <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(192,193,255,0.2)', color: 'var(--primary)', fontWeight: 700 }}>
                                AKTIF
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)', marginTop: 2 }}>
                            {p.process_name}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`badge badge-${p.state === 'ANALYZED' ? 'analyzed' : 'ready'}`} style={{ fontSize: '0.65rem' }}>
                            {p.state}
                          </span>
                          <button
                            title="Hapus Proyek"
                            disabled={deletingId === p.id}
                            onClick={(e) => handleDeleteProject(p, e)}
                            style={{
                              background: 'transparent', border: 'none', color: 'var(--outline)',
                              cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center',
                              transition: 'color 0.15s, background 0.15s'
                            }}
                            onMouseOver={e => { e.currentTarget.style.color = '#ff516a'; e.currentTarget.style.background = 'rgba(255,81,106,0.1)'; }}
                            onMouseOut={e => { e.currentTarget.style.color = 'var(--outline)'; e.currentTarget.style.background = 'transparent'; }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                              {deletingId === p.id ? 'hourglass_empty' : 'delete'}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="divider" style={{ margin: '18px 0' }} />
                </div>
              )}

              <div className="form-label" style={{ marginBottom: 12 }}>Buat Proyek Baru</div>
              <div className="form-group">
                <label className="form-label">Nama Proyek *</label>
                <input className="form-input" placeholder="contoh: Analisis Keluhan Pelanggan Q3" value={newProjName} onChange={e => setNewProjName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Nama Proses Bisnis *</label>
                <input className="form-input" placeholder="contoh: Resolusi Keluhan Pelanggan" value={newProjProcess} onChange={e => setNewProjProcess(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewProject(false)}>Tutup</button>
              <button className="btn btn-primary" onClick={handleNewProject} disabled={!newProjName || !newProjProcess}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                Buat Proyek
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
