import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const clientsAPI = {
  list: () => api.get('/ghl-clients'),
  create: (data) => api.post('/ghl-clients', data),
  get: (id) => api.get(`/ghl-clients/${id}`),
  update: (id, data) => api.put(`/ghl-clients/${id}`, data),
  delete: (id) => api.delete(`/ghl-clients/${id}`),
  test: (id) => api.post(`/ghl-clients/${id}/test`),
};

export const reportsAPI = {
  list: () => api.get('/reports'),
  generate: (data) => api.post('/reports/generate', data),
  get: (id) => api.get(`/reports/${id}`),
  delete: (id) => api.delete(`/reports/${id}`),
};

export default api;
