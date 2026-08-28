const BASE_URL = "http://localhost:8000/api/v1";

async function request(method, path, body = null, isFormData = false) {
  const options = {
    method,
    headers: isFormData ? {} : { "Content-Type": "application/json" },
  };
  if (body) {
    options.body = isFormData ? body : JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// Projects
export const api = {
  // --- Projects ---
  createProject: (data) => request("POST", "/projects", data),
  listProjects: () => request("GET", "/projects"),
  getProject: (id) => request("GET", `/projects/${id}`),
  updateProject: (id, data) => request("PATCH", `/projects/${id}`, data),
  deleteProject: (id) => request("DELETE", `/projects/${id}`),
  getProjectFindings: (id) => request("GET", `/projects/${id}/findings`),
  createScenario: (projectId, data) => request("POST", `/projects/${projectId}/scenarios`, data),
  listScenarios: (projectId) => request("GET", `/projects/${projectId}/scenarios`),
  askAI: (projectId, data) => request("POST", `/projects/${projectId}/ai/ask`, data),

  // --- Datasets ---
  uploadDataset: (projectId, file) => {
    const form = new FormData();
    form.append("file", file);
    return request("POST", `/projects/${projectId}/datasets`, form, true).then(r => r.data);
  },
  inspectDataset: (datasetId) => request("POST", `/datasets/${datasetId}/inspect`),
  suggestMapping: (datasetId) => request("POST", `/datasets/${datasetId}/mapping/suggest`),
  getCapabilities: (datasetId) => request("GET", `/datasets/${datasetId}/capabilities`),
  listDatasets: (projectId) => request("GET", `/projects/${projectId}/datasets`),
  getDataset: (id) => request("GET", `/datasets/${id}`),
  saveMapping: (datasetId, mapping) => request("POST", `/datasets/${datasetId}/mapping`, mapping),
  getMapping: (datasetId) => request("GET", `/datasets/${datasetId}/mapping`),
  previewDataset: (datasetId) => request("POST", `/datasets/${datasetId}/preview`),
  confirmDataset: (datasetId) => request("POST", `/datasets/${datasetId}/confirm`),
  deleteDataset: (id) => request("DELETE", `/datasets/${id}`),

  // --- Analyses ---
  triggerAnalysis: (datasetId, config) =>
    request("POST", `/datasets/${datasetId}/analyses`, config).then(r => r.data),
  getLatestProjectAnalysis: (projectId) =>
    request("GET", `/projects/${projectId}/latest-analysis`).then(r => r.data),
  getLatestDatasetAnalysis: (datasetId) =>
    request("GET", `/datasets/${datasetId}/latest-analysis`).then(r => r.data),
  getAnalysisStatus: (id) => request("GET", `/analyses/${id}`).then(r => r.data),
  getAnalysisSummary: (id) => request("GET", `/analyses/${id}/summary`).then(r => r.data),
  getProcessGraph: (id) => request("GET", `/analyses/${id}/process-graph`),
  getMetrics: (id) => request("GET", `/analyses/${id}/metrics`),
  getVariants: (id) => request("GET", `/analyses/${id}/variants`),
  getAnalysisFindings: (id) => request("GET", `/projects/${id}/findings`).catch(() => []),

  // --- Scenarios ---
  getScenario: (id) => request("GET", `/scenarios/${id}`),
  validateScenario: (id, analysisId) =>
    request("POST", `/scenarios/${id}/validate?analysis_id=${analysisId}`),
  simulateScenario: (id, analysisId) =>
    request("POST", `/scenarios/${id}/simulate?analysis_id=${analysisId}`).then(r => r.data),
  getSimulationResults: (id) => request("GET", `/scenarios/${id}/results`).then(r => r.data),
};

export default api;
