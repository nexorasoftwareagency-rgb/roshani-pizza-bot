# Roshani Pizza ERP - Server Maintenance Guide (AWS)

This guide provides step-by-step instructions for managing the Roshani Pizza ERP and WhatsApp Bot on your AWS EC2 instance.

## 1. Process Management (PM2)
The application uses **PM2** to ensure the bot and server remain online 24/7.

### Basic Commands
| Action | Command |
| :--- | :--- |
| **View Status** | `pm2 status` |
| **Restart Bot** | `pm2 restart roshani-bot` |
| **Stop Bot** | `pm2 stop roshani-bot` |
| **Check Health** | `pm2 monit` |

### Log Inspection (CRITICAL for Debugging)
If a customer reports they are not receiving updates, check the logs immediately:
- **Real-time Logs**: `pm2 logs roshani-bot`
- **Error Only**: `pm2 logs roshani-bot --err`
- **History (last 100 lines)**: `pm2 logs roshani-bot --lines 100`

---

## 2. GitHub Synchronization
To push or pull latest changes from GitHub:

### Pulling Updates to Server
1. Connect via SSH: `ssh ubuntu@172.31.14.126`
2. Navigate to project: `cd ~/Prasant-Pizza-ERP`
3. Pull changes: `git pull origin main`
4. Restart the bot to apply changes: `pm2 restart roshani-bot`

### Pushing from Local to GitHub
1. Stage changes: `git add .`
2. Commit: `git commit -m "Hardened operations and bot UX"`
3. Push: `git push origin main`

---

## 3. Firebase & Data Maintenance
- **Nuclear Refresh**: If the Admin panel feels "stuck" or shows old data, use the **Nuclear Refresh** button in the sidebar. This wipes the browser cache and stale Service Workers without logging you out.
- **Database Backups**: Firebase Realtime Database handles scaling automatically, but you can export JSON backups from the Firebase Console under the "Data" tab.

---

## 4. Troubleshooting
- **Bot Offline?** 
  - Check PM2 status: `pm2 status`
  - If it says "stopped", run `pm2 start bot/index.js --name roshani-bot`
- **WhatsApp Logged Out?**
  - Run `pm2 logs roshani-bot`. 
  - If you see a QR code, scan it using the "Linked Devices" feature in your WhatsApp mobile app.

---

*Prepared by Antigravity AI for Roshani Pizza ERP*
