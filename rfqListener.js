// listeners/rfqListener.js
const { Client } = require('pg');
const nodemailer = require('nodemailer');

// ✅ Track active client to prevent duplicate listeners
let activeClient = null;

const costingMap = {
  Chokes:   { to: "allan.riegel@avocarbon.com",     firstName: "Allan" },
  Brushes:  { to: "francis.vimalraj@avocarbon.com", firstName: "Francis" },
  Seals:    { to: "mootaz.farwa@avocarbon.com",     firstName: "Mootaz" },
  Assembly: { to: "fatma.guermassi@avocarbon.com",  firstName: "Fatma" },
  Friction: { to: "FRICTION_EMAIL@avocarbon.com",   firstName: "FirstName" },
};

const transporter = nodemailer.createTransport({
  host: "avocarbon-com.mail.protection.outlook.com",
  port: 25,
  secure: false,
  auth: {
    user: "administration.STS@avocarbon.com",
    pass: "shnlgdyfbcztbhxn",
  },
});

async function startRfqListener() {
  // ✅ Kill existing connection before creating a new one
  if (activeClient) {
    try {
      await activeClient.end();
      console.log('🔄 Previous listener connection closed');
    } catch (_) {}
    activeClient = null;
  }

  const client = new Client({
    user: 'administrationSTS',
    host: 'avo-adb-002.postgres.database.azure.com',
    database: 'Costing_DB',
    password: 'St$@0987',
    port: 5432,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query('LISTEN rfq_confirmed');
    activeClient = client; // ✅ Store reference
    console.log('👂 Listening for rfq_confirmed events...');
  } catch (err) {
    console.error('❌ Failed to connect listener to DB:', err);
    setTimeout(startRfqListener, 5000);
    return;
  }

  client.on('notification', async (msg) => {
    try {
      const rfq = JSON.parse(msg.payload);
      console.log(`🔔 DB trigger fired — RFQ #${rfq.rfq_id} | product_line: "${rfq.product_line}"`);

      const target = costingMap[rfq.product_line?.trim()];
      if (!target) {
        console.warn(`⚠️ No recipient for product_line "${rfq.product_line}" — email skipped`);
        return;
      }

      // ... rest of your email sending code stays the same
    } catch (err) {
      console.error('❌ Error in rfq_confirmed listener:', err);
    }
  });

  client.on('error', (err) => {
    console.error('❌ Listener DB connection error — reconnecting in 5s...', err);
    activeClient = null;
    setTimeout(startRfqListener, 5000);
  });
}

module.exports = { startRfqListener };
