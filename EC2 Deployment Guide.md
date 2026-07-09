# EC2 Deployment Guide — Roshani Pizza ERP

## Prerequisites

- Ubuntu 24.04 LTS EC2 instance
- Domain pointing to EC2 (optional, for SSL)
- Firebase project: `prashant-pizza-e86e4`

---

## 1. Initial EC2 Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Verify
node -v   # v20.x
npm -v    # 10.x
```

## 2. Install PM2

```bash
sudo npm install -g pm2
```

## 3. Clone Repository

```bash
git clone https://github.com/<your-org>/roshani-pizza-bot.git
cd roshani-pizza-bot
```

## 4. Install Bot Dependencies

```bash
cd bot
npm install
cd ..
```

## 5. Add Firebase Service Account

The bot uses `firebase-admin` npm package (already in dependencies) — no CLI needed.

Place `service-account.json` in the `bot/` directory.

## 6. Fix Known Prod Bugs Before Starting

### Bug 1: Undefined phone in walk-in POS orders

**Root cause**: `bot/index.js:598` writes `phone: order.phone` (undefined for walk-in orders) to Firebase, which rejects `undefined` values.

**Fix** (already in local codebase):
```js
// bot/index.js line 598 — guard undefined phone
phone: order.phone || null,
```

### Bug 2: Rogue Cake-bot entry point on production

**Root cause**: Production has a standalone `Cake-bot/index.js` that `require('qrcode')` but only `qrcode-terminal` is installed. Both bots run from `bot/index.js` with `OUTLET` env var — the `Cake-bot/` dir should not contain code.

**Fix on production**:
```bash
rm -rf /home/ubuntu/roshani-pizza-bot/Cake-bot
pm2 restart cake-bot
```

## 7. Start Bots with PM2

```bash
cd ~/roshani-pizza-bot
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # run the printed command to enable on-boot

# Verify
pm2 status
pm2 logs pizza-bot --lines 20
pm2 logs cake-bot --lines 20
```

## 8. Deploy (from Your Dev Machine, Not EC2)

```bash
# Run locally, not on EC2
firebase deploy --only database,hosting
```

## 10. Daily Operations

```bash
# View logs
pm2 logs pizza-bot          # tail live
pm2 logs pizza-bot --lines 50   # last 50 lines
pm2 logs cake-bot

# Restart bots (after git pull)
git pull
pm2 restart all

# Save PM2 process list
pm2 save

# Monitor
pm2 monit
pm2 status
```

## 11. Production Logs Reference

```bash
# Bot logs
tail -f /home/ubuntu/.pm2/logs/pizza-bot-out.log
tail -f /home/ubuntu/.pm2/logs/pizza-bot-error.log
tail -f /home/ubuntu/.pm2/logs/cake-bot-out.log
tail -f /home/ubuntu/.pm2/logs/cake-bot-error.log
```

---

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|------|
| `UPDATE ERROR: undefined in property 'bot.logs.*.phone'` | Walk-in order has no phone | Already fixed in code — `|| null` guard |
| `Cannot find module 'qrcode'` | Rogue `Cake-bot/index.js` on prod | `rm Cake-bot/index.js; pm2 restart cake-bot` |
| `Cannot find module 'qrcode-terminal'` | `npm install` not run in bot/ | `cd bot; npm install` |
| Bot shows QR code but won't connect | Session expired | Delete `bot/session_data/` and restart |
| Firebase permission denied | service-account.json missing or wrong | Verify file exists and has correct project ID |
