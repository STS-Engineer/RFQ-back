const express = require('express');
const pool = require('../db');

const router = express.Router();



// Get all RFQ info (joined with context)
router.get("/rfq", async (req, res) => {
  try {
    const query = `
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

        -- Contact info
        c.contact_id,
        c.contact_role,
        c.contact_email,
        c.contact_phone,
        c.created_at AS contact_created_at

      FROM public.main m
      LEFT JOIN public.contact c ON m.contact_id_fk = c.contact_id
      ORDER BY m.created_at DESC;
    `;

    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching RFQ data:", error);
    res.status(500).json({ message: "Server error fetching RFQ data" });
  }
});


module.exports=  router;
