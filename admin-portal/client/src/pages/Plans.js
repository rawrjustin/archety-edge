import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

function Plans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPlans = async () => {
    try {
      const response = await apiService.getPlans();
      setPlans(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load plans: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
    const interval = setInterval(loadPlans, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">Loading conversation plans...</div>;
  }

  return (
    <div className="plans">
      <div className="card">
        <h2>Conversation Plans</h2>

        {error && <div className="error">{error}</div>}

        <button
          className="button button-secondary"
          onClick={loadPlans}
          style={{ marginBottom: '1rem' }}
        >
          🔄 Refresh
        </button>

        {plans.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            No conversation plans
          </p>
        ) : (
          <div>
            {plans.map((plan) => (
              <div
                key={plan.thread_id}
                style={{
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #3a3a3a',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  marginBottom: '1rem',
                }}
              >
                <h3 style={{ margin: 0, color: '#00ff88' }}>
                  Thread: <code style={{ fontSize: '0.9rem' }}>{plan.thread_id}</code>
                </h3>

                <p style={{ color: '#888', fontSize: '0.85rem', margin: '0.5rem 0' }}>
                  Version: {plan.version}
                </p>

                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ color: '#00ccff', fontSize: '1rem', marginBottom: '0.5rem' }}>
                    Plan Data:
                  </h4>
                  <pre
                    style={{
                      backgroundColor: '#1a1a1a',
                      padding: '1rem',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      overflowX: 'auto',
                      maxHeight: '400px',
                      overflowY: 'auto',
                    }}
                  >
                    {typeof plan.plan_data === 'string'
                      ? plan.plan_data
                      : JSON.stringify(plan.plan_data, null, 2)}
                  </pre>
                </div>

                <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '1rem' }}>
                  Created: {new Date(plan.created_at).toLocaleString()} | Updated:{' '}
                  {new Date(plan.updated_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '1rem', color: '#666', fontSize: '0.85rem' }}>
          Showing {plans.length} conversation plan(s)
        </div>
      </div>
    </div>
  );
}

export default Plans;
