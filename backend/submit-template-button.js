/**
 * Submit WhatsApp templates with CTA buttons to Meta via Omnichat
 * POST /api/integration/template/submit
 *
 * Usage: node submit-template-button.js [template_name]
 *   template_name: invoice_created | due_date_reminder | all (default)
 */

require('dotenv').config();
const axios = require('axios');
const { query, initializePool } = require('./config/database');

async function getApiKey() {
    const res = await query("SELECT value FROM app_config WHERE key = 'kilusi_omnichat_api_key'");
    return (res.rows[0]?.value || '').trim();
}

function buildButtonsComponent(samples) {
    const invoiceSample = samples.find(s => s.includes('INV')) || 'INV/2026/0501';
    const tokenSample = 'ABCDEF1234567890ABCDEF1234567890ABCDEF';
    return {
        type: 'BUTTONS',
        buttons: [
            {
                type: 'URL',
                text: 'Bayar Sekarang',
                url: 'https://billing.kilusi.id/pay/{{1}}',
                example: [invoiceSample]
            },
            {
                type: 'URL',
                text: 'Buka Portal',
                url: 'https://portal.kilusi.id/customer/login/{{1}}',
                example: [tokenSample]
            }
        ]
    };
}

async function submitTemplate(template, apiKey) {
    const name = template.meta_name || template.template_id;
    const category = template.meta_category || 'UTILITY';
    const language = template.meta_language || 'id';

    // Extract header if any
    const header = template.meta_components
        ? (typeof template.meta_components === 'string'
            ? JSON.parse(template.meta_components)
            : template.meta_components
        ).find(c => c.type === 'HEADER')
        : null;

    // Build components
    const components = [];

    // Add header if exists
    if (header) {
        components.push(header);
    }

    // Build BODY with numbered placeholders and samples
    const variables = template.variables || [];
    let bodyText = template.content || '';
    const samples = [];

    variables.forEach((varName, index) => {
        const regex = new RegExp(`{{${varName}}}`, 'g');
        bodyText = bodyText.replace(regex, `{{${index + 1}}}`);

        const vl = varName.toLowerCase();
        let sampleValue = varName;
        if (vl.includes('nama') || vl.includes('name'))
            sampleValue = 'Budi Santoso';
        else if (vl.includes('nomor') || vl.includes('service') || vl.includes('number'))
            sampleValue = '24000010601';
        else if (vl.includes('paket') || vl.includes('package'))
            sampleValue = 'PAKET BRONZE';
        else if (vl.includes('amount') || vl.includes('harga') || vl.includes('price'))
            sampleValue = '150.000';
        else if (vl.includes('due') || vl.includes('jatuh') || vl.includes('tempo') || vl.includes('active') || vl.includes('tanggal'))
            sampleValue = '27 Mei 2026';
        else if (vl.includes('invoice') || vl.includes('inv'))
            sampleValue = 'INV/2026/0501';
        else if (vl.includes('company') || vl.includes('perusahaan'))
            sampleValue = 'Kilusi ID';
        else if (vl.includes('support') || vl.includes('phone') || vl.includes('telepon') || vl.includes('call') || vl.includes('cs'))
            sampleValue = '08123456789';
        else if (vl.includes('portal') || vl.includes('link') || vl.includes('url'))
            sampleValue = 'https://portal.kilusi.id/customer/login/ABCDEF1234567890ABCDEF1234567890ABCDEF';
        else if (vl.includes('speed') || vl.includes('kecepatan'))
            sampleValue = '25 Mbps';
        else if (vl.includes('sisa') || vl.includes('remaining') || vl.includes('hari'))
            sampleValue = '3';

        samples.push(sampleValue);
    });

    components.push({
        type: 'BODY',
        text: bodyText,
        example: { body_text: [samples] }
    });

    // Add footer if exists
    const footer = template.meta_components
        ? (typeof template.meta_components === 'string'
            ? JSON.parse(template.meta_components)
            : template.meta_components
        ).find(c => c.type === 'FOOTER')
        : null;

    if (footer) {
        components.push(footer);
    }

    // Add BUTTONS
    components.push(buildButtonsComponent(samples));

    const payload = {
        name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        category,
        language,
        components
    };

    console.log(`\n📤 Submitting "${name}" (${template.template_id})...`);
    console.log(`   Category: ${category}, Language: ${language}`);
    console.log(`   Components: ${components.length} (${components.map(c => c.type).join(', ')})`);
    console.log(`   Variables: ${variables.join(', ')}`);

    try {
        const response = await axios.post(
            'https://whatsapp.kilusi.id/api/integration/template/submit',
            payload,
            {
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        console.log(`✅ Success:`, JSON.stringify(response.data, null, 2));

        // Update DB status to pending_approval
        await query(
            `UPDATE whatsapp_templates
             SET meta_status = 'pending_approval',
                 meta_category = $1,
                 meta_language = $2,
                 meta_components = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [category, language, JSON.stringify(components), template.id]
        );
        console.log(`   DB updated: meta_status = pending_approval`);

        return true;
    } catch (error) {
        const errData = error.response?.data;
        console.error(`❌ Failed:`, errData || error.message);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
        }
        return false;
    }
}

async function main() {
    const targetTemplate = process.argv[2] || 'all';

    await initializePool();
    const apiKey = await getApiKey();

    if (!apiKey) {
        console.error('❌ API key not found in app_config');
        process.exit(1);
    }

    console.log(`🔑 API Key: ${apiKey.substring(0, 10)}...`);
    console.log(`🎯 Target: ${targetTemplate}`);

    let whereClause;
    if (targetTemplate === 'all') {
        whereClause = `WHERE template_id IN ('invoice_created', 'due_date_reminder')`;
    } else {
        whereClause = `WHERE template_id = '${targetTemplate}'`;
    }

    const templates = await query(
        `SELECT id, template_id, meta_name, meta_content, meta_category, meta_language, meta_components, content, variables
         FROM whatsapp_templates ${whereClause}
         ORDER BY template_id`
    );

    if (templates.rows.length === 0) {
        console.error('❌ No templates found');
        process.exit(1);
    }

    console.log(`\n📋 Templates to submit: ${templates.rows.length}`);
    let successCount = 0;

    for (const template of templates.rows) {
        const ok = await submitTemplate(template, apiKey);
        if (ok) successCount++;
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ ${successCount}/${templates.rows.length} templates submitted successfully`);
    console.log(`⏳ Check status in a few hours (Meta review: 1-6 hours)`);
    console.log(`📡 After approval, run: node sync-templates-live.js`);

    process.exit(successCount === templates.rows.length ? 0 : 1);
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
