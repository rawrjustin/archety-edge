import React, { useState, useEffect, useRef } from 'react';
import { apiService, connectLogStream } from '../services/api';

function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [liveMode, setLiveMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef(null);
  const wsRef = useRef(null);

  const loadLogs = async () => {
    try {
      const response = await apiService.getLogs(200);
      setLogs(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load logs: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleLiveMode = () => {
    if (liveMode) {
      // Disconnect WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setLiveMode(false);
    } else {
      // Connect WebSocket
      const token = localStorage.getItem('admin_token');
      if (!token) {
        alert('No auth token found. Please refresh the page.');
        return;
      }

      try {
        wsRef.current = connectLogStream((logLine) => {
          setLogs((prev) => [...prev, logLine].slice(-500)); // Keep last 500 lines
        }, token);
        setLiveMode(true);
      } catch (err) {
        setError('Failed to connect to log stream: ' + err.message);
      }
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  useEffect(() => {
    loadLogs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = filter
    ? logs.filter((log) => log.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const getLogLevel = (logLine) => {
    if (logLine.includes('ERROR') || logLine.includes('❌')) return 'error';
    if (logLine.includes('WARN') || logLine.includes('⚠️')) return 'warn';
    if (logLine.includes('INFO') || logLine.includes('✅')) return 'info';
    return 'debug';
  };

  return (
    <div className="logs">
      <div className="card">
        <h2>Log Viewer</h2>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            className={`button ${liveMode ? 'button-danger' : 'button-primary'}`}
            onClick={toggleLiveMode}
          >
            {liveMode ? '⏹ Stop Live Mode' : '▶ Start Live Mode'}
          </button>

          <button className="button button-secondary" onClick={loadLogs}>
            🔄 Refresh
          </button>

          <button className="button button-secondary" onClick={clearLogs}>
            🗑️ Clear
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
        </div>

        <input
          type="text"
          className="input"
          placeholder="Filter logs..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ marginBottom: '1rem' }}
        />

        {loading && <div className="loading">Loading logs...</div>}
        {error && <div className="error">{error}</div>}

        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #2a2a2a',
            borderRadius: '8px',
            padding: '1rem',
            maxHeight: '600px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            lineHeight: '1.5',
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
              No logs to display
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <div
                key={index}
                style={{
                  marginBottom: '0.25rem',
                  color:
                    getLogLevel(log) === 'error'
                      ? '#ff6b6b'
                      : getLogLevel(log) === 'warn'
                      ? '#ffd93d'
                      : getLogLevel(log) === 'info'
                      ? '#6bcf7f'
                      : '#b0b0b0',
                }}
              >
                {log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        <div style={{ marginTop: '1rem', color: '#666', fontSize: '0.85rem' }}>
          {liveMode ? (
            <span style={{ color: '#00ff88' }}>● Live mode active</span>
          ) : (
            <span>Showing {filteredLogs.length} log lines</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default Logs;
