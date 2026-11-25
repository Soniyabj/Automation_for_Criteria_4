// src/services/api.js
import axios from 'axios';

const API = axios.create({
  baseURL: 'http://127.0.0.1:5000/api',
});

// Token helpers
export function setAuthToken(token) {
  if (token) API.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete API.defaults.headers.common['Authorization'];
}

const token = localStorage.getItem('token');
if (token) setAuthToken(token);

// helper to safely build path segments
function enc(s) {
  return encodeURIComponent(String(s));
}

// Auth APIs
export const auth = {
  register: (creds) => API.post('/auth/register', creds),
  login: (creds) => API.post('/auth/login', creds),
};

// Batch APIs
export const batches = {
  create: (payload) => API.post('/batches', payload),
  list: (branch) => API.get('/batches', { params: branch ? { branch } : {} }),
  get: (branch, batchName) =>
    API.get(`/batches/${enc(branch)}/${enc(batchName)}`),

  import: (branch, batchName, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return API.post(`/batches/${enc(branch)}/${enc(batchName)}/import`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  bulkAddStudents: (branch, batchName, payload) =>
    API.post(`/batches/${enc(branch)}/${enc(batchName)}/students/bulk`, payload),

  updateStudent: (branch, batchName, sid, payload) =>
    API.put(`/batches/${enc(branch)}/${enc(batchName)}/students/${enc(sid)}`, payload),

  uploadOffer: (branch, batchName, sid, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return API.post(`/batches/${enc(branch)}/${enc(batchName)}/students/${enc(sid)}/offer`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  aggregates: (branch, batchName) =>
    API.get(`/batches/${enc(branch)}/${enc(batchName)}/aggregates`),
};

// Existing export
export const exportApi = {
  excel: (branch, batchName) =>
    API.get(`/export/excel/${enc(branch)}/${enc(batchName)}`, {
      responseType: 'blob',
    }),
  pdf: (branch, batchName) =>
    API.get(`/export/pdf/${enc(branch)}/${enc(batchName)}`, {
      responseType: 'blob',
    }),
};

// 🔥 NEW: Admission APIs
export const admission = {
  listBatches: () => API.get('/admission/batches'),
  getBatch: (batchName) => API.get(`/admission/${enc(batchName)}`),

  saveBatch: (batchName, rows) =>
    API.post(`/admission/${enc(batchName)}`, { rows }),

  importExcel: (batchName, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return API.post(`/admission/${enc(batchName)}/import`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  excelUrl: (batchName) =>
    `http://127.0.0.1:5000/api/export/admission/excel/${enc(batchName)}`,

  pdfUrl: (batchName) =>
    `http://127.0.0.1:5000/api/export/admission/pdf/${enc(batchName)}`,
};

export default API;
