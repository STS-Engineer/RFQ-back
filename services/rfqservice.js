const express = require('express');
const pool = require('../db');

const router = express.Router();



// Get all RFQ info (joined with context)
router.get("/rfq", async (req, res) => {
  try {
    // Fetch confirmed and declined RFQs from main table
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

    // Fetch pending RFQs from pending_validations table
    const pendingQuery = `
      SELECT 
        p.request_id AS rfq_id,
        p.data->>'customer_name' AS customer_name,
        p.data->>'application' AS application,
        p.data->>'product_line' AS product_line,
        p.data->>'customer_pn' AS customer_pn,
        p.data->>'revision_level' AS revision_level,
        p.data->>'delivery_zone' AS delivery_zone,
        p.data->>'delivery_plant' AS delivery_plant,
        (p.data->>'sop_year')::int AS sop_year,
        (p.data->>'annual_volume')::int AS annual_volume,
        p.data->>'rfq_reception_date' AS rfq_reception_date,
        p.data->>'quotation_expected_date' AS quotation_expected_date,
        (p.data->>'target_price_eur')::numeric AS target_price_eur,
        p.data->>'delivery_conditions' AS delivery_conditions,
        p.data->>'payment_terms' AS payment_terms,
        p.data->>'business_trigger' AS business_trigger,
        p.data->>'entry_barriers' AS entry_barriers,
        p.data->>'product_feasibility_note' AS product_feasibility_note,
        p.data->>'manufacturing_location' AS manufacturing_location,
        p.data->>'risks' AS risks,
        p.data->>'decision' AS decision,
        p.data->>'design_responsibility' AS design_responsibility,
        p.data->>'validation_responsibility' AS validation_responsibility,
        p.data->>'design_ownership' AS design_ownership,
        p.data->>'development_costs' AS development_costs,
        p.data->>'technical_capacity' AS technical_capacity,
        p.data->>'scope_alignment' AS scope_alignment,
        p.data->>'overall_feasibility' AS overall_feasibility,
        p.data->>'customer_status' AS customer_status,
        p.data->>'strategic_note' AS strategic_note,
        p.data->>'final_recommendation' AS final_recommendation,
        p.data->>'validator_comments' AS validator_comments,
        'PENDING' AS status,
        p.created_at AS rfq_created_at,
        p.data->>'user_email' AS created_by_email,
        p.data->>'validator_email' AS validated_by_email,
        NULL::int AS contact_id,
        p.data->'contact'->>'role' AS contact_role,
        p.data->'contact'->>'email' AS contact_email,
        p.data->'contact'->>'phone' AS contact_phone,
        NULL::timestamp AS contact_created_at
      FROM public.pending_validations p
      WHERE p.status = 'PENDING'
      ORDER BY p.created_at DESC;
    `;
    const pendingResult = await pool.query(pendingQuery);

    // Group RFQs by status
    const groupedRfqs = {
      PENDING: pendingResult.rows,
      CONFIRM: mainResult.rows.filter(r => r.status === 'CONFIRM'),
      DECLINE: mainResult.rows.filter(r => r.status === 'DECLINE')
    };

    res.status(200).json(groupedRfqs);
  } catch (error) {
    console.error("Error fetching grouped RFQ data:", error);
    res.status(500).json({ message: "Server error fetching grouped RFQs" });
  }
});

module.exports=  router;
