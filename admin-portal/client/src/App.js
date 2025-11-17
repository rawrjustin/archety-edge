import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Config from './pages/Config';
import Scheduled from './pages/Scheduled';
import Rules from './pages/Rules';
import Plans from './pages/Plans';
import TestTools from './pages/TestTools';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>⚡ Edge Agent Admin Portal</h1>
          <nav className="nav-tabs">
            <Link
              to="/"
              className={activeTab === 'dashboard' ? 'active' : ''}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </Link>
            <Link
              to="/logs"
              className={activeTab === 'logs' ? 'active' : ''}
              onClick={() => setActiveTab('logs')}
            >
              Logs
            </Link>
            <Link
              to="/config"
              className={activeTab === 'config' ? 'active' : ''}
              onClick={() => setActiveTab('config')}
            >
              Configuration
            </Link>
            <Link
              to="/scheduled"
              className={activeTab === 'scheduled' ? 'active' : ''}
              onClick={() => setActiveTab('scheduled')}
            >
              Scheduled
            </Link>
            <Link
              to="/rules"
              className={activeTab === 'rules' ? 'active' : ''}
              onClick={() => setActiveTab('rules')}
            >
              Rules
            </Link>
            <Link
              to="/plans"
              className={activeTab === 'plans' ? 'active' : ''}
              onClick={() => setActiveTab('plans')}
            >
              Plans
            </Link>
            <Link
              to="/test"
              className={activeTab === 'test' ? 'active' : ''}
              onClick={() => setActiveTab('test')}
            >
              Test Tools
            </Link>
          </nav>
        </header>

        <main className="App-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/config" element={<Config />} />
            <Route path="/scheduled" element={<Scheduled />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/test" element={<TestTools />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
