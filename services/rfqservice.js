// routes/rfq.ts
const express = require('express');
const pool = require('../db');
const nodemailer = require('nodemailer');
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // store files in uploads folder
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // e.g. 1699478881000-123456789.pdf
  },
});

const upload = multer({ storage });

const transporter = nodemailer.createTransport({
  host: "avocarbon-com.mail.protection.outlook.com",
  port: 25,
  secure: false,
  auth: {
    user: "administration.STS@avocarbon.com",
    pass: "shnlgdyfbcztbhxn",
  },
});


router.post("/rfq/:id/upload", upload.single("file"), async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const filePath = `/uploads/${req.file.filename}`;

  try {
    // 1) Update costing file in DB
    const updateQuery = `
      UPDATE public.main
      SET costingfile = $1,
          updated_at = NOW()
      WHERE rfq_id = $2
      RETURNING *;
    `;

    const updateResult = await pool.query(updateQuery, [filePath, id]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "RFQ not found" });
    }

    const rfq = updateResult.rows[0];
    const productLine = rfq.product_line;

    // 2) Decide responsible email based on product_line
    let recipientEmail = null;

    switch (productLine) {
      case "Brushes":
        recipientEmail = "cedric.bouvier@avocarbon.com";
        break;

      case "Chokes":
        recipientEmail = "allan.riegel@avocarbon.com";
        break;

      case "Assembly":
        recipientEmail = "allan.riegel@avocarbon.com";
        break;

      default:
        console.log(`No responsible email configured for product line: ${productLine}`);
        break;
    }

    // 3) Send email only if a recipient exists
    if (recipientEmail) {
      const mailOptions = {
        from: "administration.STS@avocarbon.com",
        to: recipientEmail,
        subject: `New Costing File Submitted - RFQ #${rfq.rfq_id}`,
        html: `
          <h3>New costing file submitted</h3>
          <p>A new costing file has been uploaded for the following RFQ:</p>

          <ul>
            <li><strong>RFQ ID:</strong> ${rfq.rfq_id}</li>
            <li><strong>Customer Name:</strong> ${rfq.customer_name || "N/A"}</li>
            <li><strong>Product Line:</strong> ${rfq.product_line || "N/A"}</li>
            <li><strong>Customer PN:</strong> ${rfq.customer_pn || "N/A"}</li>
            <li><strong>Uploaded By:</strong> ${rfq.updated_by || "System"}</li>
          </ul>

          <br />
          <p>Best regards,<br />RFQ Management System</p>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`Costing submission email sent to ${recipientEmail}`);
    }

    res.status(200).json({
      message: "Costing file uploaded successfully",
      rfq: updateResult.rows[0],
    });
  } catch (error) {
    console.error("Error uploading costing file:", error);
    res.status(500).json({
      message: "Error uploading costing file",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Upload Feasibility File
// ─────────────────────────────────────────────────────────────────────────────
router.post("/rfq/:id/upload-feasibility", upload.single("file"), async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const filePath = `/uploads/${req.file.filename}`;

  try {
    const updateQuery = `
      UPDATE public.main
      SET feasabilityfile = $1,
          updated_at = NOW()
      WHERE rfq_id = $2
      RETURNING *;
    `;

    const updateResult = await pool.query(updateQuery, [filePath, id]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "RFQ not found" });
    }

    const rfq = updateResult.rows[0];
    const productLine = rfq.product_line;
    const uploadedAt = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // ── Generic notification email (existing logic) ──────────────────────────
    let recipientEmail = null;

    switch (productLine) {
      case "Brushes":
        recipientEmail = "cedric.bouvier@avocarbon.com";
        break;
      case "Chokes":
        recipientEmail = "allan.riegel@avocarbon.com";
        break;
      case "Assembly":
        recipientEmail = "allan.riegel@avocarbon.com";
        break;
      default:
        console.log(`No responsible email configured for product line: ${productLine}`);
        break;
    }

    if (recipientEmail) {
      const appUrl = "https://rfq-management.azurewebsites.net/";
      const mailOptions = {
        from: "administration.STS@avocarbon.com",
        to: recipientEmail,
        subject: `📋 Feasibility File Submitted — RFQ #${rfq.rfq_id} | ${rfq.customer_name || "N/A"}`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Feasibility File Submitted</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 8px 32px rgba(0,0,0,0.10);">

          <!-- ░░ TOP ACCENT BAR ░░ -->
          <tr>
            <td style="height:5px;background:linear-gradient(90deg,#0d6efd 0%,#6ea8fe 50%,#0dcaf0 100%);"></td>
          </tr>

          <!-- ░░ HEADER ░░ -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f2044 0%,#1a3a6b 100%);
                       padding:44px 48px 36px;text-align:center;">
              <!-- Icon badge -->
              <div style="display:inline-block;background:rgba(255,255,255,0.12);
                          border:2px solid rgba(255,255,255,0.22);border-radius:50%;
                          width:64px;height:64px;line-height:64px;
                          font-size:30px;margin-bottom:18px;">📋</div>
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;
                         color:#ffffff;letter-spacing:0.2px;">
                Feasibility File Submitted
              </h1>
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.72);line-height:1.5;">
                A feasibility document has been uploaded and is awaiting your review
              </p>
            </td>
          </tr>

          <!-- ░░ TIMESTAMP BANNER ░░ -->
          <tr>
            <td style="background:#f0f6ff;border-bottom:1px solid #d8e6ff;
                       padding:12px 48px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#0d6efd;font-weight:600;">
                    🗂 &nbsp;New feasibility file uploaded
                  </td>
                  <td align="right" style="font-size:12px;color:#6b7a8d;white-space:nowrap;">
                    🕐 &nbsp;${uploadedAt}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ░░ BODY ░░ -->
          <tr>
            <td style="padding:40px 48px;">

              <p style="margin:0 0 28px;font-size:15px;color:#3d4a5c;line-height:1.7;">
                Hello,<br/><br/>
                A feasibility file has been successfully submitted for the RFQ listed below.
                Please review the document in the RFQ Management portal and proceed
                with the required actions.
              </p>

              <!-- ── RFQ Details card ── -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border:1px solid #e2e8f0;border-radius:12px;
                            overflow:hidden;margin-bottom:32px;">
                <!-- card header -->
                <tr>
                  <td colspan="2"
                      style="background:linear-gradient(90deg,#0f2044,#1a3a6b);
                             padding:13px 22px;">
                    <p style="margin:0;font-size:11px;font-weight:700;
                               color:#ffffff;letter-spacing:1.8px;
                               text-transform:uppercase;">
                      RFQ Information
                    </p>
                  </td>
                </tr>

                <!-- row 1 -->
                <tr style="background:#f8fafc;">
                  <td width="50%" style="padding:15px 22px;
                      border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:700;
                               color:#8a97a8;letter-spacing:1px;text-transform:uppercase;">
                      RFQ ID
                    </p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#0f2044;">
                      #${rfq.rfq_id}
                    </p>
                  </td>
                  <td width="50%" style="padding:15px 22px;
                      border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:700;
                               color:#8a97a8;letter-spacing:1px;text-transform:uppercase;">
                      Product Line
                    </p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#0f2044;">
                      ${rfq.product_line || "N/A"}
                    </p>
                  </td>
                </tr>

                <!-- row 2 -->
                <tr style="background:#ffffff;">
                  <td width="50%" style="padding:15px 22px;
                      border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:700;
                               color:#8a97a8;letter-spacing:1px;text-transform:uppercase;">
                      Customer
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#0f2044;">
                      ${rfq.customer_name || "N/A"}
                    </p>
                  </td>
                  <td width="50%" style="padding:15px 22px;
                      border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:700;
                               color:#8a97a8;letter-spacing:1px;text-transform:uppercase;">
                      Customer PN
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#0f2044;">
                      ${rfq.customer_pn || "N/A"}
                    </p>
                  </td>
                </tr>

                <!-- row 3 -->
                <tr style="background:#f8fafc;">
                  <td width="50%" style="padding:15px 22px;
                      border-right:1px solid #e2e8f0;">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:700;
                               color:#8a97a8;letter-spacing:1px;text-transform:uppercase;">
                      Annual Volume
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#0f2044;">
                      ${rfq.annual_volume ? Number(rfq.annual_volume).toLocaleString("en-US") : "N/A"} units
                    </p>
                  </td>
                  <td width="50%" style="padding:15px 22px;">
                    <p style="margin:0 0 3px;font-size:10px;font-weight:700;
                               color:#8a97a8;letter-spacing:1px;text-transform:uppercase;">
                      Uploaded By
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#0f2044;">
                      ${rfq.updated_by || rfq.created_by_email || "System"}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- ── CTA Button ── -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <a href="${appUrl}" target="_blank"
                       style="display:inline-block;padding:15px 42px;
                              background:linear-gradient(135deg,#0d6efd 0%,#0056d2 100%);
                              color:#ffffff;text-decoration:none;border-radius:10px;
                              font-size:15px;font-weight:700;letter-spacing:0.3px;
                              box-shadow:0 6px 20px rgba(13,110,253,0.38);">
                      🔍 &nbsp; Open RFQ Application
                    </a>
                  </td>
                </tr>
              </table>

              <!-- ── Action note ── -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#fffbeb;border:1px solid #fde68a;
                            border-left:4px solid #f59e0b;border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
                      ⚠️ &nbsp;<strong>Action required:</strong>&nbsp;
                      Please log in to the RFQ Management portal to review the uploaded
                      feasibility file and take the appropriate next steps.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ░░ DIVIDER ░░ -->
          <tr>
            <td style="padding:0 48px;">
              <hr style="border:none;border-top:1px solid #e9ecef;margin:0;"/>
            </td>
          </tr>

          <!-- ░░ FOOTER ░░ -->
          <tr>
            <td style="padding:24px 48px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;color:#6b7a8d;">
                Automated notification from&nbsp;
                <strong style="color:#0f2044;">AvoCarbon RFQ Management System</strong>
              </p>
              <p style="margin:0 0 12px;font-size:12px;color:#9aa5b4;">
                Please do not reply directly to this email.
              </p>
              <a href="${appUrl}" target="_blank"
                 style="font-size:12px;color:#0d6efd;text-decoration:none;">
                ${appUrl}
              </a>
            </td>
          </tr>

          <!-- ░░ BOTTOM ACCENT BAR ░░ -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#0d6efd 0%,#6ea8fe 50%,#0dcaf0 100%);"></td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`Feasibility submission email sent to ${recipientEmail}`);
    }

    // ── Additional modern notification for Chokes → mootaz ──────────────────
    if (productLine === "Seals") {
      const chokesMailOptions = {
        from: "administration.STS@avocarbon.com",
        to: "mootaz.farwa@avocarbon.com",
        subject: `📋 Feasibility File Submitted — RFQ #${rfq.rfq_id} | ${rfq.customer_name || "N/A"}`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Feasibility File Submitted</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1a2e4a;padding:36px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase;">RFQ Management System</p>
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">
                Feasibility File Submitted
              </h1>
              <p style="margin:12px 0 0 0;font-size:14px;color:rgba(255,255,255,0.85);">
                A feasibility document has been uploaded and is ready for your review
              </p>
            </td>
          </tr>

          <!-- Status Banner -->
          <tr>
            <td style="background:#e8f4fd;padding:14px 40px;border-bottom:1px solid #d0e8f8;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#0d6efd;font-weight:600;">
                    📁 &nbsp;New feasibility file uploaded
                  </td>
                  <td align="right" style="font-size:12px;color:#6b7a8d;">
                    ${uploadedAt}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">

              <p style="margin:0 0 24px 0;font-size:15px;color:#3d4a5c;line-height:1.6;">
                Dear <strong>Mootaz</strong>,<br/><br/>
                A feasibility file has been submitted for the RFQ below. Please log in to the RFQ Management portal to review the document and take the appropriate next steps.
              </p>

              <!-- RFQ Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:28px;">
                <tr>
                  <td style="background:#1a2e4a;padding:12px 20px;">
                    <p style="margin:0;font-size:12px;font-weight:700;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;">
                      RFQ Details
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">

                      <tr>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;margin-bottom:8px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">RFQ ID</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">#${rfq.rfq_id}</p>
                        </td>
                        <td width="4%"></td>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Product Line</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.product_line || "N/A"}</p>
                        </td>
                      </tr>

                      <tr><td colspan="3" style="height:10px;"></td></tr>

                      <tr>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Customer</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.customer_name || "N/A"}</p>
                        </td>
                        <td width="4%"></td>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Customer PN</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.customer_pn || "N/A"}</p>
                        </td>
                      </tr>

                      <tr><td colspan="3" style="height:10px;"></td></tr>

                      <tr>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Annual Volume</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.annual_volume ? Number(rfq.annual_volume).toLocaleString() : "N/A"}</p>
                        </td>
                        <td width="4%"></td>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Uploaded By</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.updated_by || rfq.created_by_email || "System"}</p>
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px 0;">
                    <a href="https://rfq-management.azurewebsites.net/"
                       target="_blank"
                       style="display:inline-block;padding:14px 36px;background:#0d6efd;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(13,110,253,0.35);">
                      🔍 &nbsp; Review Feasibility File
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info Note -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                      ⚠️ &nbsp;<strong>Action required:</strong> The costing file submission for this RFQ is now unlocked. Please review the feasibility document and proceed accordingly.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#6b7a8d;">
                This is an automated notification from the <strong>AvoCarbon RFQ Management System</strong>.
              </p>
              <p style="margin:0;font-size:12px;color:#9aa5b4;">
                Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
        `,
      };

      await transporter.sendMail(chokesMailOptions);
      console.log(`✅ Modern feasibility notification sent to mootaz.farwa@avocarbon.com for Chokes RFQ #${rfq.rfq_id}`);
    } else if (productLine === "Assembly") {
      const assemblyMailOptions = {
        from: "administration.STS@avocarbon.com",
        to: "rami.mejri@avocarbon.com",
        subject: `📋 Feasibility File Submitted — RFQ #${rfq.rfq_id} | ${rfq.customer_name || "N/A"}`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Feasibility File Submitted</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1a2e4a;padding:36px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase;">RFQ Management System</p>
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">
                Feasibility File Submitted
              </h1>
              <p style="margin:12px 0 0 0;font-size:14px;color:rgba(255,255,255,0.85);">
                A feasibility document has been uploaded and is ready for your review
              </p>
            </td>
          </tr>

          <!-- Status Banner -->
          <tr>
            <td style="background:#e8f4fd;padding:14px 40px;border-bottom:1px solid #d0e8f8;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#0d6efd;font-weight:600;">
                    📁 &nbsp;New feasibility file uploaded
                  </td>
                  <td align="right" style="font-size:12px;color:#6b7a8d;">
                    ${uploadedAt}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">

              <p style="margin:0 0 24px 0;font-size:15px;color:#3d4a5c;line-height:1.6;">
                Dear <strong>Rami</strong>,<br/><br/>
                A feasibility file has been submitted for the RFQ below. Please log in to the RFQ Management portal to review the document and take the appropriate next steps.
              </p>

              <!-- RFQ Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:28px;">
                <tr>
                  <td style="background:#1a2e4a;padding:12px 20px;">
                    <p style="margin:0;font-size:12px;font-weight:700;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;">
                      RFQ Details
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">

                      <tr>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;margin-bottom:8px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">RFQ ID</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">#${rfq.rfq_id}</p>
                        </td>
                        <td width="4%"></td>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Product Line</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.product_line || "N/A"}</p>
                        </td>
                      </tr>

                      <tr><td colspan="3" style="height:10px;"></td></tr>

                      <tr>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Customer</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.customer_name || "N/A"}</p>
                        </td>
                        <td width="4%"></td>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Customer PN</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.customer_pn || "N/A"}</p>
                        </td>
                      </tr>

                      <tr><td colspan="3" style="height:10px;"></td></tr>

                      <tr>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Annual Volume</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.annual_volume ? Number(rfq.annual_volume).toLocaleString() : "N/A"}</p>
                        </td>
                        <td width="4%"></td>
                        <td width="48%" style="padding:8px 12px;background:#ffffff;border-radius:6px;">
                          <p style="margin:0;font-size:11px;color:#8a97a8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Uploaded By</p>
                          <p style="margin:4px 0 0 0;font-size:15px;color:#1a2e4a;font-weight:700;">${rfq.updated_by || rfq.created_by_email || "System"}</p>
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px 0;">
                    <a href="https://rfq-management.azurewebsites.net/"
                       target="_blank"
                       style="display:inline-block;padding:14px 36px;background:#0d6efd;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(13,110,253,0.35);">
                      🔍 &nbsp; Review Feasibility File
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info Note -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                      ⚠️ &nbsp;<strong>Action required:</strong> The costing file submission for this RFQ is now unlocked. Please review the feasibility document and proceed accordingly.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#6b7a8d;">
                This is an automated notification from the <strong>AvoCarbon RFQ Management System</strong>.
              </p>
              <p style="margin:0;font-size:12px;color:#9aa5b4;">
                Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
        `,
      };

      await transporter.sendMail(assemblyMailOptions);
      console.log(`✅ Modern feasibility notification sent to rami.mejri@avocarbon.com (Assembly) for RFQ #${rfq.rfq_id}`);
    }

    res.status(200).json({
      message: "Feasibility file uploaded successfully",
      rfq: updateResult.rows[0],
    });
  } catch (error) {
    console.error("Error uploading feasibility file:", error);
    res.status(500).json({
      message: "Error uploading feasibility file",
      error: error.message,
    });
  }
});


router.post("/rfq/send-costing-email/:id", upload.single("file"), async (req, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  try {
    // 🔍 1. Get requester email and product_line from DB
    const result = await pool.query(
      `SELECT created_by_email, product_line FROM public.main WHERE rfq_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "RFQ not found." });
    }

    const requesterEmail = result.rows[0].created_by_email;
    const productLine = result.rows[0].product_line;

    if (!requesterEmail) {
      return res.status(400).json({ message: "Requester email missing." });
    }

    if (!productLine) {
      return res.status(400).json({ message: "Product line missing." });
    }

    // 🎯 2. Determine recipient email based on product_line
    let recipientEmail;

    switch (productLine) {
      case "Chokes":
        recipientEmail = "mootaz.farwa@avocarbon.com";
        break;
      case "Assembly":
        recipientEmail = "mootaz.farwa@avocarbon.com";
        break;
      case "Brushes":
        recipientEmail = "chaima.benyahia@avocarbon.com";
        break;
      default:
        console.log(`ℹ️ No specific product line match for "${productLine}", sending to requester: ${requesterEmail}`);
    }

    // 📨 3. Prepare and send email
    const mailOptions = {
      from: "administration.STS@avocarbon.com",
      to: recipientEmail,
      subject: `Costing File Submission - RFQ #${id}`,
      html: `
        <h3>Dear Requester,</h3>
        <p>Please find attached the costing file related to your RFQ #${id}.</p>
        <p><strong>Product Line:</strong> ${productLine}</p>
        <p>Best regards,<br>RFQ Management Team</p>
      `,
      attachments: [
        {
          filename: file.originalname,
          path: file.path,
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    console.log(`✅ Costing email sent to ${recipientEmail}`);
    res.json({ success: true, message: "Costing email sent successfully." });

  } catch (error) {
    console.error("❌ Error sending costing email:", error);

    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    res.status(500).json({
      message: "Error sending costing email.",
      error: error.message
    });
  }
});


router.get("/rfq", async (req, res) => {
  try {
    // 1️⃣ Fetch main RFQs
    const mainQuery = `
      SELECT 
        m.*,
        c.contact_id,
        c.contact_role,
        c.contact_email,
        c.contact_phone,
        c.created_at AS contact_created_at
      FROM public.main m
      LEFT JOIN public.contact c ON m.contact_id_fk = c.contact_id
      WHERE m.status IN ('CONFIRM', 'DECLINE')
      ORDER BY m.created_at DESC;
    `;
    const mainResult = await pool.query(mainQuery);

    // 2️⃣ Fetch pending RFQs
    const pendingQuery = `
      SELECT 
        p.request_id AS rfq_id,
        p.data->'rfq_payload' AS rfq_payload,
        p.data->>'user_email' AS created_by_email,
        p.data->>'validator_email' AS validated_by_email,
        p.created_at AS rfq_created_at,
        p.status
      FROM public.pending_validations p
      WHERE p.status = 'PENDING'
      ORDER BY p.created_at DESC;
    `;
    const pendingResult = await pool.query(pendingQuery);

    // 3️⃣ Helper to format numbers
    const formatToKEuro = (number) => {
      if (!number) return '0 k€';
      const divided = number / 1000;
      return number % 1000 === 0
        ? Math.round(divided).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' k€'
        : divided.toFixed(3).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' k€';
    };

    // 4️⃣ Helper function to parse PostgreSQL array string
    const parsePostgresArray = (arrayString) => {
      if (!arrayString || typeof arrayString !== 'string') {
        return [];
      }

      const cleanString = arrayString.replace(/^{|}$/g, '');
      if (!cleanString) return [];

      return cleanString.split(',').map(item => item.trim()).filter(item => item);
    };

    // 5️⃣ Process main RFQs
    const processedMain = mainResult.rows.map(row => {
      let filePaths = [];

      if (row.rfq_file_path && typeof row.rfq_file_path === 'string') {
        if (row.rfq_file_path.startsWith('{') && row.rfq_file_path.endsWith('}')) {
          filePaths = parsePostgresArray(row.rfq_file_path);
        } else {
          filePaths = [row.rfq_file_path];
        }
      } else if (Array.isArray(row.rfq_file_path)) {
        filePaths = row.rfq_file_path;
      }

      const processedFilePaths = filePaths.map(f => {
        const cleanPath = f.startsWith('/') ? f.substring(1) : f;
        return cleanPath.startsWith('http')
          ? cleanPath
          : `https://rfq-back.azurewebsites.net/${cleanPath}`;
      });

      let processedCostingFile = null;
      if (row.costingfile) {
        const cleanCostingPath = row.costingfile.startsWith('/')
          ? row.costingfile.substring(1)
          : row.costingfile;

        processedCostingFile = cleanCostingPath.startsWith('http')
          ? cleanCostingPath
          : `https://rfq-back.azurewebsites.net/${cleanCostingPath}`;
      }

      // Process feasibility file
      let processedFeasabilityFile = null;
      if (row.feasabilityfile) {
        const cleanFeasPath = row.feasabilityfile.startsWith('/')
          ? row.feasabilityfile.substring(1)
          : row.feasabilityfile;

        processedFeasabilityFile = cleanFeasPath.startsWith('http')
          ? cleanFeasPath
          : `https://rfq-back.azurewebsites.net/${cleanFeasPath}`;
      }

      return {
        ...row,
        to_total: formatToKEuro(Number(row.to_total)),
        rfq_file_path: processedFilePaths.length > 0 ? processedFilePaths : null,
        costingfile: processedCostingFile,
        feasabilityfile: processedFeasabilityFile,
      };
    });

    // 6️⃣ Process pending RFQs
    const processedPending = pendingResult.rows.map(row => {
      const p = row.rfq_payload;
      const annual_volume = parseInt(p?.annual_volume) || 0;
      const target_price_eur = parseFloat(p?.target_price_eur) || 0;

      let pendingFilePaths = [];
      if (p?.rfq_file_path && typeof p.rfq_file_path === 'string') {
        if (p.rfq_file_path.startsWith('{') && p.rfq_file_path.endsWith('}')) {
          pendingFilePaths = parsePostgresArray(p.rfq_file_path);
        } else {
          pendingFilePaths = [p.rfq_file_path];
        }
      } else if (Array.isArray(p?.rfq_file_path)) {
        pendingFilePaths = p.rfq_file_path;
      }

      const processedPendingPaths = pendingFilePaths.map(f => {
        const cleanPath = f.startsWith('/') ? f.substring(1) : f;
        return cleanPath.startsWith('http') ? cleanPath : `https://rfq-back.azurewebsites.net/${cleanPath}`;
      });

      return {
        rfq_id: row.rfq_id,
        customer_name: p?.customer_name || 'N/A',
        application: p?.application || 'N/A',
        product_line: p?.product_line || 'N/A',
        customer_pn: p?.customer_pn || 'N/A',
        revision_level: p?.revision_level || 'N/A',
        delivery_zone: p?.delivery_zone || 'N/A',
        delivery_plant: p?.delivery_plant || 'N/A',
        sop_year: parseInt(p?.sop_year) || 0,
        annual_volume,
        rfq_reception_date: p?.rfq_reception_date || null,
        quotation_expected_date: p?.quotation_expected_date || null,
        target_price_eur,
        to_total: formatToKEuro(target_price_eur * annual_volume),
        delivery_conditions: p?.delivery_conditions || 'N/A',
        payment_terms: p?.payment_terms || 'N/A',
        business_trigger: p?.business_trigger || 'N/A',
        entry_barriers: p?.entry_barriers || 'N/A',
        product_feasibility_note: p?.product_feasibility_note || 'N/A',
        manufacturing_location: p?.manufacturing_location || 'N/A',
        risks: p?.risks || 'N/A',
        decision: p?.decision || 'N/A',
        design_responsibility: p?.design_responsibility || 'N/A',
        validation_responsibility: p?.validation_responsibility || 'N/A',
        design_ownership: p?.design_ownership || 'N/A',
        development_costs: p?.development_costs || 'N/A',
        technical_capacity: p?.technical_capacity === true || p?.technical_capacity === 'true',
        scope_alignment: p?.scope_alignment === true || p?.scope_alignment === 'true',
        overall_feasibility: p?.overall_feasibility || 'N/A',
        customer_status: p?.customer_status || 'N/A',
        strategic_note: p?.strategic_note || 'N/A',
        final_recommendation: p?.final_recommendation || 'N/A',
        validator_comments: p?.validator_comments || 'N/A',
        status: 'PENDING',
        rfq_file_path: processedPendingPaths.length > 0 ? processedPendingPaths : null,
        created_by_email: row.created_by_email,
        validated_by_email: row.validated_by_email,
        rfq_created_at: row.rfq_created_at,
        feasabilityfile: null,
      };
    });

    // 7️⃣ Group by status
    const groupedRfqs = {
      PENDING: processedPending,
      CONFIRM: processedMain.filter(r => r.status === 'CONFIRM'),
      DECLINE: processedMain.filter(r => r.status === 'DECLINE')
    };

    res.status(200).json(groupedRfqs);
  } catch (err) {
    console.error("Error fetching grouped RFQ data:", err);
    res.status(500).json({ message: "Server error fetching grouped RFQs", error: err.message });
  }
});

async function sendConfirmEmail(rfq) {
  const rfqDetailsUrl = `https://rfq-management.azurewebsites.net/`;

  const mailOptions = {
    from: "administration.STS@avocarbon.com",
    to: "mootaz.farwa@avocarbon.com",
    subject: `RFQ #${rfq.rfq_id} Confirmed`,
    html: `
      <h2>RFQ Confirmed</h2>
      <p>The following RFQ has been confirmed:</p>
      <ul>
        <li><strong>RFQ ID:</strong> ${rfq.rfq_id}</li>
        <li><strong>Requester:</strong> ${rfq.created_by_email}</li>
        <li><strong>Validator:</strong> ${rfq.validated_by_email}</li> 
        <li><strong>Customer:</strong> ${rfq.customer_name}</li>
        <li><strong>Product Line:</strong> ${rfq.product_line}</li>
        <li><strong>Customer PN:</strong> ${rfq.customer_pn}</li>
        <li><strong>Application:</strong> ${rfq.application}</li>
        <li><strong>Annual Volume:</strong> ${rfq.annual_volume}</li>
        <li><strong>Target Price (€):</strong> ${rfq.target_price_eur}</li>
        <li><strong>TO Total (k€):</strong> ${rfq.to_total}</li>
        <li><strong>Market:</strong> ${rfq.delivery_zone}</li>
      </ul>

      <p>You can view full RFQ details and add costing information at the following link:</p>
      <a href="${rfqDetailsUrl}" target="_blank"
         style="display:inline-block;padding:10px 15px;background:#0078d4;color:white;text-decoration:none;border-radius:5px;">
         View RFQ Details
      </a>

      <br><br>
      <p>Best regards,<br>RFQ Management System</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Confirmation email sent for RFQ #${rfq.rfq_id}`);
  } catch (err) {
    console.error(`❌ Failed to send confirmation email for RFQ #${rfq.rfq_id}:`, err);
  }
}

router.put("/rfq/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const updateQuery = `
      UPDATE public.main
      SET status = $1
      WHERE rfq_id = $2
      RETURNING *;
    `;
    const result = await pool.query(updateQuery, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "RFQ not found" });
    }

    const updatedRfq = result.rows[0];

    if (status === "CONFIRM") {
      await sendConfirmEmail(updatedRfq);
    }

    res.status(200).json({
      message: `RFQ status updated to ${status}`,
      rfq: updatedRfq
    });
  } catch (error) {
    console.error("Error updating RFQ status:", error);
    res.status(500).json({ message: "Error updating RFQ status", error: error.message });
  }
});

// Costing details endpoint
router.get('/costing-details/:rfqId', async (req, res) => {
  try {
    const { rfqId } = req.params;

    const costedProductQuery = `
            SELECT cp.*, c.*
            FROM costed_products cp
            LEFT JOIN components c ON c.component_id = cp.component_id
            WHERE cp.rfq_id = $1
        `;

    const costedProductResult = await pool.query(costedProductQuery, [rfqId]);

    if (costedProductResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No costing data found for this RFQ'
      });
    }

    const bomQuery = `
            SELECT * FROM bom_parameters 
            WHERE costed_product_id = $1
            ORDER BY bom_product
        `;

    const routingQuery = `
            SELECT * FROM routing_parameters 
            WHERE costed_product_id = $1
            ORDER BY router_operation_no
        `;

    const costedProductId = costedProductResult.rows[0].id;

    const [bomResult, routingResult] = await Promise.all([
      pool.query(bomQuery, [costedProductId]),
      pool.query(routingQuery, [costedProductId])
    ]);

    const totalBOMCost = bomResult.rows.reduce((sum, item) =>
      sum + (item.bom_landedcost || 0), 0
    );

    const totalRoutingCost = routingResult.rows.reduce((sum, item) =>
      sum + (item.router_genericcapex || 0) + (item.router_specificcapex || 0), 0
    );

    res.json({
      success: true,
      data: {
        costedProduct: costedProductResult.rows[0],
        bomParameters: bomResult.rows,
        routingParameters: routingResult.rows,
        summary: {
          totalBOMItems: bomResult.rows.length,
          totalRoutingOperations: routingResult.rows.length,
          totalBOMCost,
          totalRoutingCost,
          grandTotal: totalBOMCost + totalRoutingCost
        }
      }
    });

  } catch (error) {
    console.error('Error fetching costing details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching costing details',
      error: error.message
    });
  }
});


module.exports = router;
