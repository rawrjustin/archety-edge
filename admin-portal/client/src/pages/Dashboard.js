import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backendTest, setBackendTest] = useState(null);

  const loadStats = async () => {
    try {
      const response = await apiService.getStats();
      setStats(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load stats: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const testBackend = async () => {
    try {
      const response = await apiService.testBackendConnection();
      setBackendTest(response.data);
    } catch (err) {
      setBackendTest({ healthy: false, error: err.message });
    }
  };

  const restartService = async () => {
    if (!window.confirm('Are you sure you want to restart the service?')) {
      return;
    }

    try {
      await apiService.restartService();
      alert('Service restarting...');
      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      alert('Failed to restart service: ' + err.message);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="dashboard">
      <div className="card">
        <h2>Edge Agent Status</h2>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Uptime</div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>
              {formatUptime(stats.uptime_seconds)}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">WebSocket</div>
            <div className="stat-value" style={{ fontSize: '1.2rem' }}>
              <span className={`status-indicator ${stats.websocket_connected ? 'online' : 'offline'}`}></span>
              {stats.websocket_connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">HTTP Fallback</div>
            <div className="stat-value" style={{ fontSize: '1.2rem' }}>
              <span className={`status-indicator ${stats.http_fallback_active ? 'online' : 'offline'}`}></span>
              {stats.http_fallback_active ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>

        <h3>Statistics</h3>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Scheduled Messages</div>
            <div className="stat-value">{stats.scheduled_messages}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Active Rules</div>
            <div className="stat-value">{stats.active_rules}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Messages Processed</div>
            <div className="stat-value">{stats.messages_processed || 0}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Messages Sent</div>
            <div className="stat-value">{stats.messages_sent || 0}</div>
          </div>
        </div>

        <h3>Configuration</h3>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Agent ID</div>
            <div className="stat-value" style={{ fontSize: '1rem', wordBreak: 'break-all' }}>
              {stats.edge_agent_id}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Backend URL</div>
            <div className="stat-value" style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>
              {stats.backend_url}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Poll Interval</div>
            <div className="stat-value">{stats.imessage_poll_interval}s</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Performance Profile</div>
            <div className="stat-value" style={{ fontSize: '1.2rem' }}>
              {stats.performance_profile}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Backend Connection Test</h2>
        <button className="button button-primary" onClick={testBackend}>
          Test Backend Connection
        </button>

        {backendTest && (
          <div style={{ marginTop: '1rem' }}>
            {backendTest.healthy ? (
              <div className="success">
                ✅ Backend is healthy (latency: {backendTest.latency}ms)
              </div>
            ) : (
              <div className="error">
                ❌ Backend is unhealthy: {backendTest.error || 'Unknown error'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Service Control</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="button button-danger" onClick={restartService}>
            Restart Service
          </button>
        </div>
        <p style={{ marginTop: '1rem', color: '#888', fontSize: '0.9rem' }}>
          Note: Restarting the service will temporarily disconnect the admin portal.
          The page will reload automatically after 3 seconds.
        </p>
      </div>
    </div>
  );
}

export default Dashboard;
