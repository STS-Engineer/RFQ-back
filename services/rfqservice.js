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
    // ✅ Fetch CONFIRM and DECLINE RFQs
    const mainQuery = `
      SELECT 
        m.rfq_id,
        m.customer_name,
        m.application,
        m.product_line,
        m.customer_pn,
        m.revision_level,
        m.delivery_zone,
        m.delivery_plant,
        m.sop_year,
        m.annual_volume,
        m.rfq_reception_date,
        m.quotation_expected_date,
        m.target_price_eur,
        (m.target_price_eur * m.annual_volume)::numeric(15,2) AS to_total,
        m.delivery_conditions,
        m.payment_terms,
        m.business_trigger,
        m.entry_barriers,
        m.product_feasibility_note,
        m.manufacturing_location,
        m.risks,
        m.decision,
        m.design_responsibility,
        m.validation_responsibility,
        m.design_ownership,
        m.development_costs,
        m.technical_capacity,
        m.scope_alignment,
        m.overall_feasibility,
        m.customer_status,
        m.strategic_note,
        m.final_recommendation,
        m.validator_comments,
        m.status,
        m.rfq_file_path,
        m.costingfile, 
        m.created_at AS rfq_created_at,
        m.created_by_email,
        m.validated_by_email,
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

    // ✅ Fetch PENDING RFQs
    const pendingQuery = `
      SELECT 
        p.request_id AS rfq_id,
        p.data->'rfq_payload'->>'customer_name' AS customer_name,
        p.data->'rfq_payload'->>'application' AS application,
        p.data->'rfq_payload'->>'product_line' AS product_line,
        p.data->'rfq_payload'->>'customer_pn' AS customer_pn,
        p.data->'rfq_payload'->>'revision_level' AS revision_level,
        p.data->'rfq_payload'->>'delivery_zone' AS delivery_zone,
        p.data->'rfq_payload'->>'delivery_plant' AS delivery_plant,
        (p.data->'rfq_payload'->>'sop_year')::int AS sop_year,
        (p.data->'rfq_payload'->>'annual_volume')::int AS annual_volume,
        p.data->'rfq_payload'->>'rfq_reception_date' AS rfq_reception_date,
        p.data->'rfq_payload'->>'quotation_expected_date' AS quotation_expected_date,
        (p.data->'rfq_payload'->>'target_price_eur')::numeric AS target_price_eur,
        ((p.data->'rfq_payload'->>'target_price_eur')::numeric * (p.data->'rfq_payload'->>'annual_volume')::int)::numeric(15,2) AS to_total,
        p.data->'rfq_payload'->>'delivery_conditions' AS delivery_conditions,
        p.data->'rfq_payload'->>'payment_terms' AS payment_terms,
        p.data->'rfq_payload'->>'business_trigger' AS business_trigger,
        p.data->'rfq_payload'->>'entry_barriers' AS entry_barriers,
        p.data->'rfq_payload'->>'product_feasibility_note' AS product_feasibility_note,
        p.data->'rfq_payload'->>'manufacturing_location' AS manufacturing_location,
        p.data->'rfq_payload'->>'risks' AS risks,
        p.data->'rfq_payload'->>'decision' AS decision,
        p.data->'rfq_payload'->>'design_responsibility' AS design_responsibility,
        p.data->'rfq_payload'->>'validation_responsibility' AS validation_responsibility,
        p.data->'rfq_payload'->>'design_ownership' AS design_ownership,
        p.data->'rfq_payload'->>'development_costs' AS development_costs,
        p.data->'rfq_payload'->>'technical_capacity' AS technical_capacity,
        p.data->'rfq_payload'->>'scope_alignment' AS scope_alignment,
        p.data->'rfq_payload'->>'overall_feasibility' AS overall_feasibility,
        p.data->'rfq_payload'->>'customer_status' AS customer_status,
        p.data->'rfq_payload'->>'strategic_note' AS strategic_note,
        p.data->'rfq_payload'->>'final_recommendation' AS final_recommendation,
        p.data->'rfq_payload'->>'validator_comments' AS validator_comments,
        p.data->>'rfq_file_path' AS rfq_file_path,
        'PENDING' AS status,
        p.created_at AS rfq_created_at,
        p.data->>'user_email' AS created_by_email,
        p.data->>'validator_email' AS validated_by_email,
        NULL::int AS contact_id,
        p.data->'rfq_payload'->'contact'->>'role' AS contact_role,
        p.data->'rfq_payload'->'contact'->>'email' AS contact_email,
        p.data->'rfq_payload'->'contact'->>'phone' AS contact_phone,
        NULL::timestamp AS contact_created_at
      FROM public.pending_validations p
      WHERE p.status = 'PENDING'
      ORDER BY p.created_at DESC;
    `;
    const pendingResult = await pool.query(pendingQuery);

    // Function to format number divided by 1000 as "834 k€" or "1 250 k€"
  const formatToKEuro = (number) => {
  if (!number) return '0 k€';
  
  // Divide by 1000 and keep decimal places
  const divided = number / 1000;
  
  // Check if the number ends with 000 (no decimal places needed)
  if (number % 1000 === 0) {
    // Format with spaces as thousands separators (no decimals)
    return Math.round(divided).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' k€';
  } else {
    // Show with 3 decimal places and comma as decimal separator
    return divided.toFixed(3).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' k€';
  }
};

    // ✅ Process main rows (CONFIRM and DECLINE)
// ✅ Process main rows (CONFIRM and DECLINE)
const processedMain = mainResult.rows.map(row => {
  const processedRow = { ...row };
  
  // Replace to_total with formatted version divided by 1000
  if (processedRow.to_total) {
    processedRow.to_total = formatToKEuro(processedRow.to_total);
  } else {
    processedRow.to_total = '0 k€';
  }
  
  return processedRow;
});

    // ✅ Process pending rows
    const processedPending = pendingResult.rows.map(row => {
      const processedRow = { ...row };

      // Convert string booleans to actual booleans
      if (row.scope_alignment != null) processedRow.scope_alignment = String(row.scope_alignment).toLowerCase() === 'true';
      if (row.technical_capacity != null) processedRow.technical_capacity = String(row.technical_capacity).toLowerCase() === 'true';

      // Ensure numeric fields
      processedRow.annual_volume = parseInt(row.annual_volume) || 0;
      processedRow.sop_year = parseInt(row.sop_year) || 0;
      processedRow.target_price_eur = parseFloat(row.target_price_eur) || 0;
      
      // Calculate to_total and format divided by 1000 as "834 k€"
      const calculatedTotal = parseFloat(row.to_total) || (processedRow.target_price_eur * processedRow.annual_volume);
      processedRow.to_total = formatToKEuro(calculatedTotal);

      // Handle null/undefined values
      processedRow.risks = row.risks || 'N/A';
      processedRow.decision = row.decision || 'N/A';
      processedRow.entry_barriers = row.entry_barriers || 'N/A';
      processedRow.customer_status = row.customer_status || 'N/A';
      processedRow.product_feasibility_note = row.product_feasibility_note || 'N/A';
      processedRow.strategic_note = row.strategic_note || 'N/A';
      processedRow.validator_comments = row.validator_comments || 'N/A';
      processedRow.final_recommendation = row.final_recommendation || 'N/A';
      processedRow.development_costs = row.development_costs || 'N/A';

      // ✅ Ensure file path has correct base URL
      if (row.rfq_file_path && !row.rfq_file_path.startsWith('http')) {
        processedRow.rfq_file_path = `https://rfq-back.azurewebsites.net/${row.rfq_file_path}`;
      }

      return processedRow;
    });

    // ✅ Group RFQs by status
    const groupedRfqs = {
      PENDING: processedPending,
      CONFIRM: processedMain.filter(r => r.status === 'CONFIRM'),
      DECLINE: processedMain.filter(r => r.status === 'DECLINE')
    };

    res.status(200).json(groupedRfqs);
  } catch (error) {
    console.error("Error fetching grouped RFQ data:", error);
    res.status(500).json({
      message: "Server error fetching grouped RFQs",
      error: error.message
    });
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
