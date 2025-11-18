# Monitoring Quick Start Guide

This is a quick reference for setting up Sentry and Amplitude monitoring for the Edge Agent.

## Prerequisites

- Sentry account (same org as backend)
- Amplitude account (same org as backend)
- 30 minutes for initial setup

## 1. Sentry Setup (10 min)

### Create Project
1. Go to https://sentry.io/organizations/archety/projects/
2. Click "Create Project"
3. Select "Node.js" as platform
4. Name: "edge-agent"
5. Copy the DSN

### Configure Edge Agent
```bash
# Add to .env file
echo "SENTRY_DSN=https://your-dsn@sentry.io/project-id" >> .env
echo "NODE_ENV=production" >> .env
```

### Verify Connection
```bash
npm run dev
# Check Sentry dashboard for first event
```

## 2. Amplitude Setup (10 min)

### Create Project
1. Go to https://analytics.amplitude.com/
2. Click "Create Project"
3. Name: "Edge Agent"
4. Copy the API Key

### Configure Edge Agent
```bash
# Add to .env file
echo "AMPLITUDE_API_KEY=your-api-key" >> .env
```

### Verify Connection
```bash
npm run dev
# Check Amplitude dashboard for first event
```

## 3. Configure Alerts (10 min)

### Sentry Alerts

Navigate to: **Alerts → Create Alert Rule**

Create these 3 critical alerts:

#### Alert 1: Uncaught Exceptions
- **Condition:** Error tag = "uncaught_exception"
- **Frequency:** Every occurrence
- **Action:** Slack #alerts + Email
- **Priority:** Critical

#### Alert 2: Backend Connection Failures
- **Condition:** Error message contains "ECONNREFUSED"
- **Frequency:** More than 5 in 5 minutes
- **Action:** Page on-call
- **Priority:** Critical

#### Alert 3: High Error Rate
- **Condition:** More than 10 errors in 1 hour
- **Action:** Email team
- **Priority:** High

### Amplitude Alerts

Navigate to: **Manage Data → Alerts**

Create these 2 alerts:

#### Alert 1: Agent Crashes
- **Event:** "Agent Lifecycle" where lifecycle_event = "crashed"
- **Threshold:** Any occurrence
- **Action:** Email + Slack
- **Delivery:** Immediate

#### Alert 2: Message Failure Rate
- **Metric:** "Message Sent" where success = false
- **Threshold:** > 5% over 1 hour
- **Action:** Email team
- **Delivery:** Hourly digest

## 4. Health Check (Optional)

### Enable Health Check Server
```bash
# Add to .env (optional, defaults to 3001)
echo "HEALTH_CHECK_PORT=3001" >> .env
```

### Test Health Endpoint
```bash
# Start agent
npm run dev

# Check health
curl http://localhost:3001/health
# Should return: {"status":"healthy", ...}
```

### Available Endpoints
- `GET /health` - Full status with metrics
- `GET /health/live` - Simple liveness check
- `GET /health/ready` - Readiness for traffic

## 5. Verify Setup

### Check Sentry
1. Trigger a test error:
   ```bash
   # Send invalid config to trigger error
   node -e "require('./dist/index.js')" || true
   ```
2. Check Sentry dashboard for error event

### Check Amplitude
1. Process a test message (send yourself an iMessage)
2. Check Amplitude dashboard for:
   - "Message Received" event
   - "Message Sent" event
   - "Backend Request" event

### Check Metrics
After 1 hour of running, verify:
- Sentry shows error counts
- Amplitude shows event volume
- Health endpoint returns accurate metrics

## Troubleshooting

### Sentry not receiving events
```bash
# Check DSN is set
echo $SENTRY_DSN

# Check network connectivity
curl https://sentry.io/api/0/

# Check logs for Sentry errors
tail -f edge-agent.log | grep -i sentry
```

### Amplitude not receiving events
```bash
# Check API key is set
echo $AMPLITUDE_API_KEY

# Check logs
tail -f edge-agent.log | grep -i amplitude

# Verify events are being tracked
# Look for: "Amplitude initialized"
```

### Health check not responding
```bash
# Check port is not in use
lsof -i :3001

# Try different port
HEALTH_CHECK_PORT=3002 npm run dev
```

## Dashboard URLs

Once setup, bookmark these:

- **Sentry Issues:** https://sentry.io/organizations/archety/issues/
- **Sentry Performance:** https://sentry.io/organizations/archety/performance/
- **Amplitude Events:** https://analytics.amplitude.com/archety/project/YOUR_PROJECT
- **Health Check:** http://localhost:3001/health (or your production URL)

## Next Steps

After verifying the setup:

1. ✅ Review P0_IMPLEMENTATION_PLAN.md for detailed implementation
2. ✅ Set up alerting escalation policy with team
3. ✅ Create Sentry/Amplitude dashboards for daily monitoring
4. ✅ Schedule weekly review of error trends
5. ✅ Document incident response procedures

## Support

- Sentry docs: https://docs.sentry.io/platforms/node/
- Amplitude docs: https://www.docs.developers.amplitude.com/analytics/
- Edge Agent monitoring plan: `docs/P0_IMPLEMENTATION_PLAN.md`
