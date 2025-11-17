import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

function Scheduled() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMessages = async () => {
    try {
      const response = await apiService.getScheduledMessages();
      setMessages(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load scheduled messages: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const cancelMessage = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled message?')) {
      return;
    }

    try {
      await apiService.cancelScheduledMessage(id);
      alert('Message cancelled successfully');
      loadMessages();
    } catch (err) {
      alert('Failed to cancel message: ' + err.message);
    }
  };

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return '#ffd93d';
      case 'sent':
        return '#6bcf7f';
      case 'failed':
        return '#ff6b6b';
      case 'cancelled':
        return '#888';
      default:
        return '#b0b0b0';
    }
  };

  if (loading) {
    return <div className="loading">Loading scheduled messages...</div>;
  }

  return (
    <div className="scheduled">
      <div className="card">
        <h2>Scheduled Messages</h2>

        {error && <div className="error">{error}</div>}

        <button
          className="button button-secondary"
          onClick={loadMessages}
          style={{ marginBottom: '1rem' }}
        >
          🔄 Refresh
        </button>

        {messages.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
            No scheduled messages
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Thread ID</th>
                  <th>Message</th>
                  <th>Scheduled For</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr key={msg.id}>
                    <td>
                      <span
                        style={{
                          color: getStatusColor(msg.status),
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                        }}
                      >
                        {msg.status}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.8rem' }}>
                        {msg.thread_id.length > 30
                          ? msg.thread_id.substring(0, 30) + '...'
                          : msg.thread_id}
                      </code>
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      {msg.message_text.length > 100
                        ? msg.message_text.substring(0, 100) + '...'
                        : msg.message_text}
                    </td>
                    <td>{formatDate(msg.send_at)}</td>
                    <td>{formatDate(msg.created_at)}</td>
                    <td>
                      {msg.status === 'pending' && (
                        <button
                          className="button button-danger"
                          onClick={() => cancelMessage(msg.id)}
                          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                        >
                          Cancel
                        </button>
                      )}
                      {msg.error_message && (
                        <div style={{ color: '#ff6b6b', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                          {msg.error_message}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '1rem', color: '#666', fontSize: '0.85rem' }}>
          Showing {messages.length} scheduled message(s)
        </div>
      </div>
    </div>
  );
}

export default Scheduled;
