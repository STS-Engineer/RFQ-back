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
    const updateQuery = `
      UPDATE public.main
      SET costingfile = $1
      WHERE rfq_id = $2
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, [filePath, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "RFQ not found" });
    }

    res.status(200).json({
      message: "Costing file uploaded and RFQ updated successfully",
      rfq: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating costing file:", error);
    res.status(500).json({
      message: "Error updating costing file",
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

    // ✅ Use async/await properly without callback
    await transporter.sendMail(mailOptions);

    // ✅ Remove file from temp folder after sending
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    console.log(`✅ Costing email sent to ${recipientEmail}`);
    res.json({ success: true, message: "Costing email sent successfully." });

  } catch (error) {
    console.error("❌ Error sending costing email:", error);
    
    // ✅ Clean up file on error
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
      
      // Remove surrounding braces and split
      const cleanString = arrayString.replace(/^{|}$/g, '');
      if (!cleanString) return [];
      
      // Split by comma, but handle empty entries
      return cleanString.split(',').map(item => item.trim()).filter(item => item);
    };

    // 5️⃣ Process main RFQs
    const processedMain = mainResult.rows.map(row => {
      // Parse the rfq_file_path if it's in array format
      let filePaths = [];
      
      if (row.rfq_file_path && typeof row.rfq_file_path === 'string') {
        // Check if it's a PostgreSQL array format
        if (row.rfq_file_path.startsWith('{') && row.rfq_file_path.endsWith('}')) {
          filePaths = parsePostgresArray(row.rfq_file_path);
        } else {
          // It's a single path
          filePaths = [row.rfq_file_path];
        }
      } else if (Array.isArray(row.rfq_file_path)) {
        // Already an array
        filePaths = row.rfq_file_path;
      }
      
      // Convert paths to full URLs
      const processedFilePaths = filePaths.map(f => {
        // Remove leading slash if present for proper static file serving
        const cleanPath = f.startsWith('/') ? f.substring(1) : f;
        return cleanPath.startsWith('http') ? cleanPath : `https://rfq-back.azurewebsites.net/${cleanPath}`;
      });

      return {
        ...row,
        to_total: formatToKEuro(Number(row.to_total)),
        rfq_file_path: processedFilePaths.length > 0 ? processedFilePaths : null
      };
    });

    // 6️⃣ Process pending RFQs
    const processedPending = pendingResult.rows.map(row => {
      const p = row.rfq_payload;
      const annual_volume = parseInt(p?.annual_volume) || 0;
      const target_price_eur = parseFloat(p?.target_price_eur) || 0;
      
      // Parse file paths for pending RFQs too
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
      
      // Convert paths to full URLs
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
        rfq_created_at: row.rfq_created_at
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
    // ✅ Update status in the database
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

    // ✅ When status becomes CONFIRM, send email
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

//costing details endpoint 
// routes/costing.js - Enhanced version
router.get('/costing-details/:rfqId', async (req, res) => {
    try {
        const { rfqId } = req.params;
        
        // Get costed product with component details
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
        
        // Get BOM parameters
        const bomQuery = `
            SELECT * FROM bom_parameters 
            WHERE costed_product_id = $1
            ORDER BY bom_product
        `;
        
        // Get Routing parameters
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
        
        // Calculate some summary metrics
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
