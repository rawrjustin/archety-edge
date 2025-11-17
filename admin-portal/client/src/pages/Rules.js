import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

function Rules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRules = async () => {
    try {
      const response = await apiService.getRules();
      setRules(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load rules: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (ruleId, currentlyEnabled) => {
    try {
      if (currentlyEnabled) {
        await apiService.disableRule(ruleId);
      } else {
        await apiService.enableRule(ruleId);
      }
      loadRules();
    } catch (err) {
      alert('Failed to toggle rule: ' + err.message);
    }
  };

  useEffect(() => {
    loadRules();
    const interval = setInterval(loadRules, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">Loading rules...</div>;
  }

  return (
    <div className="rules">
      <div className="card">
        <h2>Message Rules</h2>

        {error && <div className="error">{error}</div>}

        <button
          className="button button-secondary"
          onClick={loadRules}
          style={{ marginBottom: '1rem' }}
        >
          🔄 Refresh
        </button>

        {rules.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            No rules configured
          </p>
        ) : (
          <div>
            {rules.map((rule) => (
              <div
                key={rule.rule_id}
                style={{
                  backgroundColor: '#2a2a2a',
                  border: `2px solid ${rule.enabled ? '#00ff88' : '#666'}`,
                  borderRadius: '8px',
                  padding: '1.5rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, color: rule.enabled ? '#00ff88' : '#888' }}>
                      {rule.name}
                    </h3>
                    <p style={{ color: '#888', fontSize: '0.85rem', margin: '0.5rem 0' }}>
                      Type: <code>{rule.rule_type}</code>
                    </p>
                    <p style={{ color: '#888', fontSize: '0.85rem', margin: '0.5rem 0' }}>
                      Rule ID: <code>{rule.rule_id}</code>
                    </p>

                    <div style={{ marginTop: '1rem' }}>
                      <h4 style={{ color: '#00ccff', fontSize: '1rem', marginBottom: '0.5rem' }}>
                        Conditions:
                      </h4>
                      <pre
                        style={{
                          backgroundColor: '#1a1a1a',
                          padding: '0.75rem',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          overflowX: 'auto',
                        }}
                      >
                        {JSON.stringify(rule.conditions, null, 2)}
                      </pre>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <h4 style={{ color: '#00ccff', fontSize: '1rem', marginBottom: '0.5rem' }}>
                        Action:
                      </h4>
                      <pre
                        style={{
                          backgroundColor: '#1a1a1a',
                          padding: '0.75rem',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          overflowX: 'auto',
                        }}
                      >
                        {JSON.stringify(rule.action, null, 2)}
                      </pre>
                    </div>

                    <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '1rem' }}>
                      Created: {new Date(rule.created_at).toLocaleString()} | Updated:{' '}
                      {new Date(rule.updated_at).toLocaleString()}
                    </p>
                  </div>

                  <div style={{ marginLeft: '1rem' }}>
                    <button
                      className={`button ${rule.enabled ? 'button-danger' : 'button-primary'}`}
                      onClick={() => toggleRule(rule.rule_id, rule.enabled)}
                    >
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '1rem', color: '#666', fontSize: '0.85rem' }}>
          Showing {rules.length} rule(s) ({rules.filter((r) => r.enabled).length} enabled)
        </div>
      </div>
    </div>
  );
}

export default Rules;
