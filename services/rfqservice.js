const express = require('express');
const pool = require('../db');

const router = express.Router();



// Get all RFQ info (joined with context)
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
        m.rfq_file_path,               -- ✅ Added file path
        m.created_at AS rfq_created_at,
        m.created_by_email,
        m.validated_by_email,
        m.requester_comment,
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
      processedRow.to_total = parseFloat(row.to_total) || (processedRow.target_price_eur * processedRow.annual_volume);

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
      CONFIRM: mainResult.rows.filter(r => r.status === 'CONFIRM'),
      DECLINE: mainResult.rows.filter(r => r.status === 'DECLINE')
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


module.exports=  router;
