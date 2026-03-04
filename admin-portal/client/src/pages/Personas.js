import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

function Personas() {
  const [personas, setPersonas] = useState([]);
  const [currentPersona, setCurrentPersona] = useState(null);
  const [devMode, setDevMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const loadDevStatus = async () => {
    try {
      const response = await apiService.getDevStatus();
      setDevMode(true);
      setCurrentPersona(response.data.current_persona);
      setError(null);
    } catch (err) {
      if (err.response?.status === 403) {
        setDevMode(false);
      } else {
        setError('Failed to check dev status: ' + err.message);
      }
    }
  };

  const loadPersonas = async () => {
    try {
      const response = await apiService.getDevPersonas();
      setPersonas(response.data.personas || []);
      setCurrentPersona(response.data.current_persona);
      setError(null);
    } catch (err) {
      if (err.response?.status !== 403) {
        setError('Failed to load personas: ' + (err.response?.data?.error || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const switchPersona = async (personaId) => {
    if (personaId === currentPersona) return;
    setSwitching(personaId);
    setStatusMsg(null);

    try {
      const response = await apiService.switchPersona(personaId);
      setCurrentPersona(response.data.current);
      setStatusMsg(`Switched: ${response.data.previous} → ${response.data.current}`);
    } catch (err) {
      setStatusMsg('Failed to switch: ' + (err.response?.data?.error || err.message));
    } finally {
      setSwitching(null);
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadDevStatus();
      await loadPersonas();
    };
    init();
    const interval = setInterval(loadDevStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">Loading personas...</div>;
  }

  if (devMode === false) {
    return (
      <div className="personas">
        <div className="card">
          <h2>Dev Mode Required</h2>
          <p style={{ color: '#888', lineHeight: 1.6 }}>
            Persona switching requires dev mode to be enabled.
            Add the following to your <code>config.yaml</code> and restart the agent:
          </p>
          <pre style={{
            backgroundColor: '#2a2a2a',
            padding: '1rem',
            borderRadius: '8px',
            marginTop: '1rem',
            color: '#00ff88',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
          }}>
{`dev:
  enabled: true`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="personas">
      {currentPersona && (
        <div className="card" style={{ borderColor: getPersonaColor(currentPersona, personas), borderWidth: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: getPersonaColor(currentPersona, personas),
              boxShadow: `0 0 8px ${getPersonaColor(currentPersona, personas)}`,
            }} />
            <h2 style={{ margin: 0, color: getPersonaColor(currentPersona, personas) }}>
              Currently responding as {getPersonaName(currentPersona, personas)}
            </h2>
            <span style={{
              backgroundColor: '#00ff8830',
              color: '#00ff88',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
            }}>DEV MODE</span>
          </div>
        </div>
      )}

      {statusMsg && (
        <div className={statusMsg.startsWith('Failed') ? 'error' : 'success'}>
          {statusMsg}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Persona Switcher</h2>
        <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Switch the active persona at runtime. The backend will respond using the selected persona's
          full voice, personality, and memory namespace. No restart required.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
        }}>
          {personas.map((persona) => {
            const isActive = persona.id === currentPersona;
            const isSwitching = persona.id === switching;
            const color = persona.color || '#6366F1';

            return (
              <div
                key={persona.id}
                onClick={() => !isSwitching && switchPersona(persona.id)}
                style={{
                  backgroundColor: isActive ? `${color}15` : '#1a1a1a',
                  border: `2px solid ${isActive ? color : '#3a3a3a'}`,
                  borderRadius: '12px',
                  padding: '1.25rem',
                  cursor: isSwitching ? 'wait' : 'pointer',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  boxShadow: isActive ? `0 0 20px ${color}30` : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = color;
                    e.currentTarget.style.boxShadow = `0 0 10px ${color}20`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = '#3a3a3a';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    top: '0.75rem',
                    right: '0.75rem',
                    backgroundColor: color,
                    color: '#000',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                  }}>Active</div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: `${color}30`,
                    border: `2px solid ${color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}>
                    {getPersonaIcon(persona.icon)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: color }}>
                      {persona.name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#888' }}>
                      {persona.tagline}
                    </div>
                  </div>
                </div>

                {persona.signature_superpower && (
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#aaa',
                    marginBottom: '0.5rem',
                  }}>
                    Superpower: {persona.signature_superpower}
                  </div>
                )}

                {persona.rarity_tier && persona.rarity_tier !== 'common' && (
                  <span style={{
                    backgroundColor: '#F59E0B30',
                    color: '#F59E0B',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                  }}>{persona.rarity_tier}</span>
                )}

                {isSwitching && (
                  <div style={{
                    marginTop: '0.75rem',
                    color: color,
                    fontSize: '0.85rem',
                  }}>Switching...</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getPersonaColor(id, personas) {
  const persona = personas.find(p => p.id === id);
  return persona?.color || '#00ff88';
}

function getPersonaName(id, personas) {
  const persona = personas.find(p => p.id === id);
  return persona?.name || id;
}

function getPersonaIcon(iconName) {
  const icons = {
    Brain: '\u{1F9E0}',
    Zap: '\u26A1',
    Heart: '\u{1F49A}',
    Shield: '\u{1F6E1}\uFE0F',
    Sparkles: '\u2728',
  };
  return icons[iconName] || '\u2728';
}

export default Personas;
