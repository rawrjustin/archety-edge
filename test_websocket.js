#!/usr/bin/env node
/**
 * WebSocket Connection Test
 * Tests WebSocket connectivity to Railway backend
 */

const WebSocket = require('ws');

// Load environment variables
require('dotenv').config();

const EDGE_SECRET = process.env.EDGE_SECRET;
const EDGE_AGENT_ID = "edge_13238407486";
const BACKEND_URL = process.env.BACKEND_URL || "https://archety-backend-dev.up.railway.app";
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

console.log('='.repeat(60));
console.log('WebSocket Connection Test');
console.log('='.repeat(60));
console.log('');
console.log('Configuration:');
console.log(`  Backend URL: ${BACKEND_URL}`);
console.log(`  WebSocket URL: ${WS_URL}`);
console.log(`  Edge Agent ID: ${EDGE_AGENT_ID}`);
console.log(`  EDGE_SECRET: ${EDGE_SECRET ? EDGE_SECRET.substring(0, 10) + '...' : 'NOT SET'}`);
console.log('');

if (!EDGE_SECRET) {
  console.error('❌ EDGE_SECRET not set in environment');
  process.exit(1);
}

const wsUrl = `${WS_URL}/edge/ws?edge_agent_id=${EDGE_AGENT_ID}`;
const headers = {
  'Authorization': `Bearer ${EDGE_SECRET}`,
  'X-Edge-Agent-Id': EDGE_AGENT_ID
};

console.log('Connection Details:');
console.log(`  URL: ${wsUrl}`);
console.log(`  Headers:`);
console.log(`    Authorization: Bearer ${EDGE_SECRET.substring(0, 20)}...`);
console.log(`    X-Edge-Agent-Id: ${EDGE_AGENT_ID}`);
console.log('');
console.log('Connecting...');
console.log('');

const ws = new WebSocket(wsUrl, { headers });

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  console.log('');
  console.log('Sending ping...');

  ws.send(JSON.stringify({ type: 'ping' }));

  // Close after 5 seconds
  setTimeout(() => {
    console.log('');
    console.log('Test complete - closing connection');
    ws.close();
  }, 5000);
});

ws.on('message', (data) => {
  console.log('📥 Received message:', data.toString());
  try {
    const parsed = JSON.parse(data.toString());
    console.log('   Parsed:', JSON.stringify(parsed, null, 2));
  } catch (e) {
    // Not JSON
  }
});

ws.on('error', (error) => {
  console.error('');
  console.error('❌ WebSocket Error:');
  console.error(`   Message: ${error.message}`);
  console.error(`   Error Object:`, error);
  console.error('');

  // Check for common issues
  if (error.message.includes('403')) {
    console.error('DIAGNOSIS: 403 Forbidden - Authentication failed');
    console.error('');
    console.error('Possible causes:');
    console.error('  1. EDGE_SECRET does not match backend configuration');
    console.error('  2. Authorization header format is incorrect');
    console.error('  3. WebSocket endpoint requires different authentication');
    console.error('  4. Backend EDGE_SECRET environment variable not set');
    console.error('');
    console.error('For Backend Engineer:');
    console.error('  - Check Railway environment variable: EDGE_SECRET');
    console.error('  - Verify WebSocket auth middleware is checking: req.headers.authorization');
    console.error(`  - Expected value: "Bearer ${EDGE_SECRET.substring(0, 20)}..."`);
  }
});

ws.on('close', (code, reason) => {
  console.log('');
  console.log(`🔌 WebSocket closed:`);
  console.log(`   Code: ${code}`);
  console.log(`   Reason: ${reason || 'No reason provided'}`);
  console.log('');

  if (code === 1006) {
    console.error('DIAGNOSIS: Code 1006 - Abnormal Closure');
    console.error('  This usually means the server rejected the connection');
    console.error('  Common causes: authentication failure, invalid endpoint');
  } else if (code === 4001) {
    console.error('DIAGNOSIS: Code 4001 - Authentication Error');
    console.error('  The backend rejected authentication');
  } else if (code === 1008) {
    console.error('DIAGNOSIS: Code 1008 - Policy Violation');
    console.error('  The backend rejected due to policy (e.g., bad auth token)');
  }

  console.log('');
  process.exit(code === 1000 ? 0 : 1);
});

// Timeout after 10 seconds
setTimeout(() => {
  if (ws.readyState === WebSocket.CONNECTING) {
    console.error('');
    console.error('❌ Connection timeout (10 seconds)');
    console.error('   The server did not respond to the connection request');
    console.error('');
    ws.terminate();
    process.exit(1);
  }
}, 10000);
