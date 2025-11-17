# Edge Agent Admin Portal

A comprehensive web-based admin portal for managing and monitoring the Edge Agent without requiring SSH or terminal access.

## Features

### 🎛️ Dashboard
- **Real-time Stats**: Uptime, message counts, connection status
- **WebSocket Status**: Monitor real-time WebSocket connection
- **HTTP Fallback**: See if HTTP polling is active
- **Performance Metrics**: Scheduled messages, active rules, messages processed
- **Configuration Overview**: Agent ID, backend URL, poll interval, performance profile
- **Backend Health Check**: Test backend connectivity with latency metrics
- **Service Control**: Restart service from the web interface

### 📋 Log Viewer
- **Real-time Log Streaming**: Live log updates via WebSocket
- **Historical Logs**: View last 200 log lines
- **Log Filtering**: Filter logs by keyword
- **Auto-scroll**: Automatically scroll to new logs
- **Color-coded**: Error, warning, info, and debug logs with different colors
- **Refresh & Clear**: Manual log refresh and clear functionality

### ⚙️ Configuration Editor
- **YAML Editor**: Edit `config.yaml` directly from the web
- **Environment Variables**: View masked environment variables
- **Validation**: JSON validation before saving
- **Auto-save**: Save configuration with restart warning

### 📅 Scheduled Messages
- **View All**: See all scheduled messages (pending, sent, failed, cancelled)
- **Status Tracking**: Color-coded status indicators
- **Cancel Messages**: Cancel pending scheduled messages
- **Auto-refresh**: Updates every 10 seconds

### 🎯 Rules Manager
- **View All Rules**: See all message rules with conditions and actions
- **Enable/Disable**: Toggle rules on/off without editing
- **Rule Types**: Support for auto_reply, forward, filter, schedule_reply
- **Detailed View**: See rule conditions and actions in formatted JSON

### 🗺️ Conversation Plans
- **View Plans**: See all active conversation plans
- **Thread Tracking**: Plans organized by thread ID
- **Version History**: Track plan versions
- **Formatted Display**: JSON-formatted plan data

### 🧪 Test Tools
- **Send Test Messages**: Send messages directly through iMessage transport
- **Thread ID Helper**: Examples and format guide for thread IDs
- **Backend Connection Test**: Test backend health and latency
- **Quick Stats**: Get instant stats snapshot

## Installation

### 1. Install Dependencies

From the root directory:

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
npm run admin:install
```

### 2. Build the Admin Portal

```bash
# Build both backend and frontend
npm run admin:build
```

This will:
- Compile TypeScript backend code
- Build React frontend to `admin-portal/client/build`

## Usage

### Starting the Admin Portal

#### Production Mode (Recommended)

Start the Edge Agent with the admin portal:

```bash
npm run admin
```

This will:
- Start the Edge Agent
- Start the Admin API server on port 3100
- Serve the React frontend from the API server

Access the portal at: **http://127.0.0.1:3100**

#### Development Mode

For development with hot-reload:

**Terminal 1** (Backend):
```bash
npm run admin:dev:server
```

**Terminal 2** (Frontend):
```bash
npm run admin:dev:client
```

Access the portal at: **http://localhost:3000** (React dev server)

### Authentication

On first access, you'll be prompted for an admin token. This token is displayed in the console when the admin server starts:

```
🔑 Auth Token: your-token-here
```

The token is derived from:
1. `ADMIN_TOKEN` environment variable (if set)
2. `EDGE_SECRET` environment variable (fallback)
3. Auto-generated random token (fallback)

**Security Note**: The admin portal only binds to `127.0.0.1` (localhost) and requires token authentication. It is designed for local access only.

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# Admin portal configuration
ADMIN_PORT=3100                    # Port for admin server (default: 3100)
ADMIN_TOKEN=your-secret-token      # Custom admin token (optional)

# Existing edge agent config
EDGE_SECRET=your-edge-secret
RELAY_WEBHOOK_SECRET=your-webhook-secret
# ... other config
```

### Port Configuration

To change the admin portal port:

```bash
ADMIN_PORT=4000 npm run admin
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Admin Portal (React Frontend)         │
│  Port: 3100                            │
│  - Dashboard                           │
│  - Logs Viewer                         │
│  - Config Editor                       │
│  - Scheduled Messages                  │
│  - Rules Manager                       │
│  - Plans Viewer                        │
│  - Test Tools                          │
└─────────────────┬───────────────────────┘
                  │ HTTP/WebSocket
┌─────────────────▼───────────────────────┐
│  Admin API Server (Express)            │
│  Port: 3100 (localhost only)           │
│  - REST API endpoints                  │
│  - WebSocket log streaming             │
│  - Auth middleware                     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  EdgeAgent (Main Application)          │
│  - Exposes admin interface             │
│  - Provides stats/metrics              │
│  - Manages scheduler, rules, plans     │
└─────────────────────────────────────────┘
```

## API Endpoints

### Public Endpoints (No Auth)
- `GET /api/health` - Health check

### Authenticated Endpoints
- `GET /api/stats` - Get current stats
- `GET /api/config` - Get config.yaml
- `PUT /api/config` - Update config.yaml
- `GET /api/env` - Get environment variables (masked)
- `GET /api/scheduled` - Get scheduled messages
- `DELETE /api/scheduled/:id` - Cancel scheduled message
- `GET /api/rules` - Get all rules
- `PUT /api/rules/:id/enable` - Enable a rule
- `PUT /api/rules/:id/disable` - Disable a rule
- `GET /api/plans` - Get all plans
- `GET /api/logs?lines=N` - Get recent logs
- `POST /api/service/restart` - Restart service
- `POST /api/service/stop` - Stop service
- `GET /api/service/status` - Get service status
- `POST /api/test/message` - Send test message
- `GET /api/test/backend` - Test backend connection

### WebSocket Endpoints
- `WS /ws/logs?token=TOKEN` - Live log streaming

## Development

### Project Structure

```
admin-portal/
├── server/
│   ├── AdminServer.ts       # Express server implementation
│   └── index.ts            # Entry point
├── client/
│   ├── src/
│   │   ├── components/     # React components (future)
│   │   ├── pages/          # Page components
│   │   │   ├── Dashboard.js
│   │   │   ├── Logs.js
│   │   │   ├── Config.js
│   │   │   ├── Scheduled.js
│   │   │   ├── Rules.js
│   │   │   ├── Plans.js
│   │   │   └── TestTools.js
│   │   ├── services/       # API service
│   │   │   └── api.js
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   │   └── index.html
│   └── package.json
└── README.md
```

### Adding New Features

1. **Add Backend Endpoint**: Edit `admin-portal/server/AdminServer.ts`
2. **Add Frontend API Call**: Edit `admin-portal/client/src/services/api.js`
3. **Create/Update Page**: Add/edit files in `admin-portal/client/src/pages/`
4. **Add Route**: Update `admin-portal/client/src/App.js`

## Troubleshooting

### Port Already in Use

If port 3100 is in use:

```bash
# Find process using port 3100
lsof -i :3100

# Kill the process
kill -9 <PID>

# Or use a different port
ADMIN_PORT=4000 npm run admin
```

### Authentication Issues

If you can't authenticate:

1. Check console output for auth token
2. Clear browser localStorage: `localStorage.clear()`
3. Refresh page and re-enter token
4. Set `ADMIN_TOKEN` in `.env` for consistent token

### Logs Not Streaming

If real-time logs aren't working:

1. Check WebSocket connection in browser console
2. Verify auth token is correct
3. Ensure log file exists at path in `config.yaml`
4. Check file permissions on log file

### Frontend Build Issues

If React build fails:

```bash
# Clear cache and rebuild
cd admin-portal/client
rm -rf node_modules build
npm install
npm run build
```

## Security Considerations

- **Localhost Only**: Server binds to `127.0.0.1` only
- **Token Authentication**: All endpoints (except health) require token
- **CORS**: Only allows `localhost` origins
- **No Remote Access**: Not designed for remote access without SSH tunnel
- **Secrets Masked**: Environment variables with secrets are masked in UI

### SSH Tunneling (Optional)

To access remotely via SSH tunnel:

```bash
# On your local machine
ssh -L 3100:127.0.0.1:3100 user@edge-agent-host

# Then access http://localhost:3100 in your browser
```

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run admin:install` | Install frontend dependencies |
| `npm run admin:build` | Build both backend and frontend |
| `npm run admin:dev:server` | Run backend in dev mode |
| `npm run admin:dev:client` | Run frontend in dev mode |
| `npm run admin:start` | Build and start in production |
| `npm run admin` | Alias for `admin:start` |

## Future Enhancements

- [ ] User authentication with multiple users
- [ ] Webhook configuration UI
- [ ] Message history browser
- [ ] Performance graphs and charts
- [ ] Export logs to file
- [ ] Rule builder UI
- [ ] Dark/light theme toggle
- [ ] Mobile-responsive design improvements

## License

MIT
