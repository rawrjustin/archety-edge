import React, { useState } from 'react';
import { apiService } from '../services/api';

function TestTools() {
  const [threadId, setThreadId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  const sendTestMessage = async () => {
    if (!threadId || !messageText) {
      alert('Please enter both thread ID and message text');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      await apiService.sendTestMessage(threadId, messageText);
      setResult({ success: true, message: 'Test message sent successfully!' });
      setMessageText('');
    } catch (err) {
      setResult({ success: false, message: 'Failed to send message: ' + err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="test-tools">
      <div className="card">
        <h2>Test Tools</h2>

        <div style={{ marginBottom: '2rem' }}>
          <h3>Send Test Message</h3>
          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Send a test message through the iMessage transport to verify functionality.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#00ccff' }}>
              Thread ID
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g., iMessage;-;+15551234567"
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
            />
            <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Format: <code>iMessage;-;+phonenumber</code> or <code>iMessage;+;chatXXXXXX</code> for
              groups
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#00ccff' }}>
              Message Text
            </label>
            <textarea
              className="textarea"
              placeholder="Enter your test message here..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              style={{ minHeight: '100px' }}
            />
          </div>

          <button
            className="button button-primary"
            onClick={sendTestMessage}
            disabled={sending}
          >
            {sending ? 'Sending...' : '📤 Send Test Message'}
          </button>

          {result && (
            <div
              className={result.success ? 'success' : 'error'}
              style={{ marginTop: '1rem' }}
            >
              {result.success ? '✅' : '❌'} {result.message}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Common Thread ID Examples</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Format</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Direct Message</td>
              <td>
                <code>iMessage;-;+phonenumber</code>
              </td>
              <td>
                <code>iMessage;-;+15551234567</code>
              </td>
            </tr>
            <tr>
              <td>Group Chat</td>
              <td>
                <code>iMessage;+;chatXXXXXXXXXX</code>
              </td>
              <td>
                <code>iMessage;+;chat123456789012345</code>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: '1rem', color: '#888', fontSize: '0.9rem' }}>
          <p>
            💡 <strong>Tip:</strong> You can find thread IDs in the logs when messages are received.
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            💡 <strong>Note:</strong> Group chat IDs are long random strings prefixed with{' '}
            <code>chat</code>.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Quick Actions</h2>
        <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Useful debugging and testing commands.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            className="button button-secondary"
            onClick={async () => {
              try {
                const response = await apiService.testBackendConnection();
                alert(
                  response.data.healthy
                    ? `✅ Backend is healthy (${response.data.latency}ms)`
                    : '❌ Backend is unhealthy'
                );
              } catch (err) {
                alert('Failed to test backend: ' + err.message);
              }
            }}
          >
            🔗 Test Backend Connection
          </button>

          <button
            className="button button-secondary"
            onClick={async () => {
              try {
                const response = await apiService.getStats();
                alert(
                  `Stats:\n` +
                    `Uptime: ${response.data.uptime_seconds}s\n` +
                    `Scheduled Messages: ${response.data.scheduled_messages}\n` +
                    `Active Rules: ${response.data.active_rules}\n` +
                    `WebSocket: ${response.data.websocket_connected ? 'Connected' : 'Disconnected'}`
                );
              } catch (err) {
                alert('Failed to get stats: ' + err.message);
              }
            }}
          >
            📊 Get Quick Stats
          </button>
        </div>
      </div>
    </div>
  );
}

export default TestTools;
