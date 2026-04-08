const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fetch = require('node-fetch');

const FIREBASE_URL = "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com";

// Fetch menu
async function getMenu() {
  const res = await fetch(`${FIREBASE_URL}/dishes.json`);
  const data = await res.json();

  if (!data) return [];

  return Object.values(data);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('session');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;

    if (qr) qrcode.generate(qr, { small: true });

    if (connection === 'open') console.log("Bot Connected");
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const sender = msg.key.remoteJid;
    const text = (msg.message.conversation || "").toLowerCase();

    // HI / HELLO
    if (text === "hi" || text === "hello") {
      await sock.sendMessage(sender, {
        text: "🍕 Welcome to Prashant Pizza\n\nType 'menu' to see items"
      });
    }

    // MENU
    if (text === "menu") {
      const menu = await getMenu();

      if (menu.length === 0) {
        await sock.sendMessage(sender, { text: "Menu empty" });
        return;
      }

      let message = "🍕 Menu:\n\n";

      menu.forEach(item => {
        message += `${item.name} - ₹${item.price}\n`;
      });

      await sock.sendMessage(sender, { text: message });
    }
  });
}

startBot();