// listeners/rfqListener.js
const { Client } = require('pg');
const nodemailer = require('nodemailer');

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
  if (activeClient) {
    try { await activeClient.end(); } catch (_) {}
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
    activeClient = client;
    console.log('👂 Listening for rfq_confirmed events...');
  } catch (err) {
    console.error('❌ Failed to connect listener to DB:', err);
    setTimeout(startRfqListener, 5000);
    return;
  }

  client.on('notification', async (msg) => {
    // ✅ Use a separate client for the advisory lock (needs its own connection)
    const lockClient = new Client({
      user: 'administrationSTS',
      host: 'avo-adb-002.postgres.database.azure.com',
      database: 'Costing_DB',
      password: 'St$@0987',
      port: 5432,
      ssl: { rejectUnauthorized: false },
    });

    try {
      const rfq = JSON.parse(msg.payload);
      console.log(`🔔 DB trigger fired — RFQ #${rfq.rfq_id} | product_line: "${rfq.product_line}"`);

      await lockClient.connect();

      // ✅ Try to acquire advisory lock using rfq_id as key
      // Only ONE instance across all Azure instances will get this lock
      const lockKey = Math.abs(rfq.rfq_id.toString().split('').reduce((a, c) => a + c.charCodeAt(0), 0));
      const lockResult = await lockClient.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [lockKey]
      );

      if (!lockResult.rows[0].acquired) {
        console.log(`⏭️ Lock not acquired for RFQ #${rfq.rfq_id} — another instance is handling it`);
        await lockClient.end();
        return;
      }

      console.log(`🔒 Lock acquired for RFQ #${rfq.rfq_id} — sending email`);

      const target = costingMap[rfq.product_line?.trim()];
      if (!target) {
        console.warn(`⚠️ No recipient for product_line "${rfq.product_line}" — email skipped`);
        await lockClient.query('SELECT pg_advisory_unlock($1)', [lockKey]);
        await lockClient.end();
        return;
      }

      const appUrl = "https://rfq-management.azurewebsites.net/";
      const confirmedAt = new Date().toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });

      await transporter.sendMail({
        from: "administration.STS@avocarbon.com",
        to: target.to,
        subject: `✅ RFQ Confirmed — #${rfq.rfq_id} | ${rfq.customer_name || "N/A"}`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:48px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.10);">
        <tr><td style="height:5px;background:#16a34a;"></td></tr>
        <tr>
          <td style="background:#1a2e4a;padding:44px 48px 36px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.12);border:2px solid rgba(255,255,255,0.22);border-radius:50%;width:64px;height:64px;line-height:64px;font-size:30px;margin-bottom:18px;">✅</div>
            <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;">RFQ Confirmed</h1>
            <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.72);">An RFQ has been confirmed and is ready for costing</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f0fdf4;border-bottom:1px solid #bbf7d0;padding:12px 48px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#16a34a;font-weight:600;">🟢 &nbsp;Status changed to CONFIRMED</td>
                <td align="right" style="font-size:12px;color:#6b7a8d;">🕐 &nbsp;${confirmedAt}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 48px;">
            <p style="margin:0 0 28px;font-size:15px;color:#3d4a5c;line-height:1.7;">
              Dear <strong>${target.firstName}</strong>,<br/><br/>
              The following RFQ has been officially confirmed. Please log in to the RFQ Management portal to review the details and proceed with the costing.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:32px;">
              <tr>
                <td colspan="2" style="background:#1a2e4a;padding:13px 22px;">
                  <p style="margin:0;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:1.8px;text-transform:uppercase;">RFQ Information</p>
                </td>
              </tr>
              <tr style="background:#f8fafc;">
                <td width="50%" style="padding:15px 22px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">RFQ ID</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#1a2e4a;">#${rfq.rfq_id}</p>
                </td>
                <td width="50%" style="padding:15px 22px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">Product Line</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#1a2e4a;">${rfq.product_line || "N/A"}</p>
                </td>
              </tr>
              <tr style="background:#ffffff;">
                <td width="50%" style="padding:15px 22px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">Customer</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a2e4a;">${rfq.customer_name || "N/A"}</p>
                </td>
                <td width="50%" style="padding:15px 22px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">Customer PN</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a2e4a;">${rfq.customer_pn || "N/A"}</p>
                </td>
              </tr>
              <tr style="background:#f8fafc;">
                <td width="50%" style="padding:15px 22px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">Application</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a2e4a;">${rfq.application || "N/A"}</p>
                </td>
                <td width="50%" style="padding:15px 22px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">Market</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a2e4a;">${rfq.delivery_zone || "N/A"}</p>
                </td>
              </tr>
              <tr style="background:#ffffff;">
                <td width="50%" style="padding:15px 22px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">Annual Volume</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a2e4a;">${rfq.annual_volume ? Number(rfq.annual_volume).toLocaleString("en-US") : "N/A"} units</p>
                </td>
                <td width="50%" style="padding:15px 22px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">Target Price</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a2e4a;">${rfq.target_price_eur ? Number(rfq.target_price_eur).toFixed(2) + " €" : "N/A"}</p>
                </td>
              </tr>
              <tr style="background:#f8fafc;">
                <td width="50%" style="padding:15px 22px;border-right:1px solid #e2e8f0;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">TO Total</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a2e4a;">${rfq.to_total || "N/A"}</p>
                </td>
                <td width="50%" style="padding:15px 22px;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#8a97a8;text-transform:uppercase;">Requester</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a2e4a;">${rfq.created_by_email || "N/A"}</p>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding-bottom:28px;">
                  <a href="${appUrl}" target="_blank"
                     style="display:inline-block;padding:15px 42px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;box-shadow:0 6px 20px rgba(22,163,74,0.35);">
                    🔍 &nbsp; Open RFQ Application
                  </a>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
                    ⚠️ &nbsp;<strong>Action required:</strong>&nbsp;Please log in to the RFQ Management portal to review this confirmed RFQ and begin the costing process.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:0 48px;"><hr style="border:none;border-top:1px solid #e9ecef;margin:0;"/></td></tr>
        <tr>
          <td style="padding:24px 48px;text-align:center;">
            <p style="margin:0 0 4px;font-size:13px;color:#6b7a8d;">Automated notification from <strong style="color:#1a2e4a;">AvoCarbon RFQ Management System</strong></p>
            <p style="margin:0 0 12px;font-size:12px;color:#9aa5b4;">Please do not reply directly to this email.</p>
            <a href="${appUrl}" style="font-size:12px;color:#0d6efd;text-decoration:none;">${appUrl}</a>
          </td>
        </tr>
        <tr><td style="height:4px;background:#16a34a;"></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });

      console.log(`✅ Confirm email sent to ${target.to} for RFQ #${rfq.rfq_id}`);

      // ✅ Release the lock after email is sent
      await lockClient.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      await lockClient.end();

    } catch (err) {
      console.error('❌ Error in rfq_confirmed listener:', err);
      try { await lockClient.end(); } catch (_) {}
    }
  });

  client.on('error', (err) => {
    console.error('❌ Listener DB connection error — reconnecting in 5s...', err);
    activeClient = null;
    setTimeout(startRfqListener, 5000);
  });
}

module.exports = { startRfqListener };
