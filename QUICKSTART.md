# Quick Start - Phase 1 Testing

Everything is configured and ready to go! Just need to install Node.js and run.

## ✅ What's Already Done

- ✅ All code written (11 TypeScript files)
- ✅ Configuration files created
- ✅ Backend credentials configured (.env)
- ✅ Phone number set (+13106781670)
- ✅ Project structure complete

## 📦 What You Need To Do

### Step 1: Install Node.js

Run the installation script I created:

```bash
cd /Users/sage1/Code/edge-relay
./install-nodejs.sh
```

This will:
- Download Node.js v20.11.0
- Install it (will ask for your password)
- Verify the installation

### Step 2: Install Dependencies

```bash
npm install
```

This installs all required packages (axios, better-sqlite3, TypeScript, etc.)

### Step 3: Build the Project

```bash
npm run build
```

This compiles TypeScript → JavaScript in the `dist/` folder.

### Step 4: Grant macOS Permissions

**CRITICAL:** Grant Full Disk Access so the edge agent can read the Messages database.

1. Open **System Preferences**
2. Go to **Security & Privacy** → **Privacy**
3. Select **Full Disk Access** from the left
4. Click the lock 🔒 and enter your password
5. Click the **+** button
6. Navigate to `/Applications/Utilities/`
7. Select **Terminal.app** and click **Open**

**Verify it worked:**
```bash
sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;"
```

You should see a number (count of messages), not an error.

### Step 5: Start the Edge Agent

```bash
npm start
```

You should see:
```
============================================================
Starting Edge Agent v1.0.0 (Phase 1: Transport)
============================================================
Registering with backend...
✅ Registered as: edge_13106781670
Starting iMessage transport...
✅ Messages.app is accessible
✅ Transport ready
✅ Backend is healthy
============================================================
✅ Edge Agent is running!
Polling for messages every 5s
Press Ctrl+C to stop
============================================================
```

### Step 6: Test It!

**From your iPhone**, send an iMessage to the Mac mini's Apple ID:

```
Hey Sage, are you there?
```

Watch the terminal. You should see:

```
📬 Processing 1 new message(s)
Processing message from +1YOUR_PHONE
📤 Sending response to iMessage;-;+1YOUR_PHONE
✅ Response sent successfully
```

And you should receive a response from Sage on your iPhone! 🎉

## 🐛 Troubleshooting

### "npm: command not found"

Node.js didn't install correctly. Try:
```bash
./install-nodejs.sh
```

Then close and reopen Terminal.

### "Cannot read Messages database"

Full Disk Access not granted. See Step 4 above.

### "Messages.app is not accessible"

Make sure Messages.app is **running** and **signed in** with an Apple ID.

### "Backend returns 401 Unauthorized"

Check that `.env` file was created correctly:
```bash
cat .env
```

Should show the EDGE_SECRET and REGISTRATION_TOKEN.

## 📋 Credentials Summary

| Setting | Value |
|---------|-------|
| **Phone Number** | +13106781670 |
| **Agent ID** | edge_13106781670 |
| **Backend URL** | https://archety-backend.onrender.com |
| **EDGE_SECRET** | ✅ Configured in .env |
| **REGISTRATION_TOKEN** | ✅ Configured in .env |

## 🎯 What Happens During First Run

1. **Registration**: Edge agent registers with backend using REGISTRATION_TOKEN
2. **Authentication**: Backend returns permanent auth token (auto-managed)
3. **Transport Start**: Connects to Messages.app and DB
4. **Health Check**: Verifies backend is reachable
5. **Polling**: Starts checking for new messages every 5 seconds

## 📊 Monitoring

Watch logs in real-time:
```bash
tail -f edge-agent.log
```

Or run in development mode with detailed output:
```bash
npm run dev
```

## 🚀 Next Steps After Testing

Once Phase 1 works:
- **Phase 2**: Add privacy filtering & PII redaction
- **Phase 3**: Add local scheduling (SQLite-based)
- **Phase 4**: Full sync protocol
- **Phase 5**: Swift migration for performance

## 💡 Development Tips

- **Dev mode** (auto-reload on changes): `npm run dev`
- **Production mode**: `npm start`
- **View logs**: `tail -f edge-agent.log`
- **Stop agent**: Press `Ctrl+C`

## 📞 Need Help?

Check these files:
- **INSTALL.md** - 10-minute quick install
- **SETUP_GUIDE.md** - Detailed setup with troubleshooting
- **README.md** - Full project documentation

---

**Ready?** Run `./install-nodejs.sh` to begin!
