import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

function Config() {
  const [config, setConfig] = useState(null);
  const [env, setEnv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editedConfig, setEditedConfig] = useState('');

  const loadConfig = async () => {
    try {
      const [configResponse, envResponse] = await Promise.all([
        apiService.getConfig(),
        apiService.getEnv(),
      ]);
      setConfig(configResponse.data);
      setEnv(envResponse.data);
      setEditedConfig(JSON.stringify(configResponse.data, null, 2));
      setError(null);
    } catch (err) {
      setError('Failed to load configuration: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      const parsedConfig = JSON.parse(editedConfig);
      await apiService.updateConfig(parsedConfig);
      setSuccess('Configuration updated successfully. Restart required to apply changes.');
      setConfig(parsedConfig);
      setError(null);
    } catch (err) {
      setError('Failed to save configuration: ' + err.message);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  if (loading) {
    return <div className="loading">Loading configuration...</div>;
  }

  return (
    <div className="config">
      <div className="card">
        <h2>Configuration (config.yaml)</h2>

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

        <textarea
          className="textarea"
          value={editedConfig}
          onChange={(e) => setEditedConfig(e.target.value)}
          style={{ minHeight: '400px' }}
        />

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button className="button button-primary" onClick={saveConfig}>
            💾 Save Configuration
          </button>

          <button className="button button-secondary" onClick={loadConfig}>
            🔄 Reset Changes
          </button>
        </div>

        <p style={{ marginTop: '1rem', color: '#ff8800', fontSize: '0.9rem' }}>
          ⚠️ Warning: Service restart required after saving changes
        </p>
      </div>

      <div className="card">
        <h2>Environment Variables</h2>
        <p style={{ color: '#888', marginBottom: '1rem' }}>
          These are read-only. Edit the .env file directly to change them.
        </p>

        <table className="table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {env &&
              Object.entries(env).map(([key, value]) => (
                <tr key={key}>
                  <td>
                    <code>{key}</code>
                  </td>
                  <td>
                    <code>{value}</code>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Config;
