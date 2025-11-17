import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:3100';

// Get token from localStorage or prompt user
const getAuthToken = () => {
  let token = localStorage.getItem('admin_token');
  if (!token) {
    token = prompt('Please enter the admin token (check console output when starting the server):');
    if (token) {
      localStorage.setItem('admin_token', token);
    }
  }
  return token;
};

// Create axios instance with auth
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      alert('Authentication failed. Please refresh and enter the correct token.');
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  // Health check
  healthCheck: () => api.get('/api/health'),

  // Stats
  getStats: () => api.get('/api/stats'),

  // Configuration
  getConfig: () => api.get('/api/config'),
  updateConfig: (config) => api.put('/api/config', config),
  getEnv: () => api.get('/api/env'),

  // Scheduled messages
  getScheduledMessages: () => api.get('/api/scheduled'),
  cancelScheduledMessage: (id) => api.delete(`/api/scheduled/${id}`),

  // Rules
  getRules: () => api.get('/api/rules'),
  enableRule: (id) => api.put(`/api/rules/${id}/enable`),
  disableRule: (id) => api.put(`/api/rules/${id}/disable`),

  // Plans
  getPlans: () => api.get('/api/plans'),

  // Logs
  getLogs: (lines = 100) => api.get(`/api/logs?lines=${lines}`),

  // Service control
  restartService: () => api.post('/api/service/restart'),
  stopService: () => api.post('/api/service/stop'),
  getServiceStatus: () => api.get('/api/service/status'),

  // Test endpoints
  sendTestMessage: (threadId, text) =>
    api.post('/api/test/message', { thread_id: threadId, text }),
  testBackendConnection: () => api.get('/api/test/backend'),
};

// WebSocket for live logs
export const connectLogStream = (onLog, token) => {
  const wsUrl = `ws://127.0.0.1:3100/ws/logs?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'log') {
        onLog(data.data);
      }
    } catch (error) {
      console.error('Failed to parse log message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  return ws;
};
