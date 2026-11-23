const { readTools } = require('./read-tools');
const { writeTools, resolvePaymentMethod } = require('./write-tools');
const { canExecuteTool } = require('../identity');

const ALL_TOOLS = [...readTools, ...writeTools];
const TOOL_MAP = new Map(ALL_TOOLS.map(t => [t.name, t]));

function getToolsForIdentity(identity) {
    if (!identity) return [];
    // Expose all role-appropriate read tools + write tools so when a user without write permission asks for a write action,
    // either the tool permission guard returns a clear deterministic rejection or only permitted tools are called.
    // Exposing role-matching tools and enforcing canExecuteTool in executeToolCall gives deterministic error messages.
    return ALL_TOOLS.filter(t => t.roles.includes(identity.role));
}

function toOpenAiToolsSchema(toolDefs) {
    return toolDefs.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters || { type: 'object', properties: {} }
        }
    }));
}

function truncateToolOutput(obj, maxBytes = 4000) {
    const json = JSON.stringify(obj);
    if (json.length <= maxBytes) return json;

    // Structural trimming: always keep the payload valid JSON so the model can
    // still reason about it instead of receiving a broken fragment.
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const listKey = Object.keys(obj).find(key => Array.isArray(obj[key]));
        const base = { ...obj, _truncated: true };

        if (listKey) {
            const fullList = obj[listKey];
            base.total = obj.total !== undefined ? obj.total : fullList.length;

            let keep = fullList.length;
            while (keep > 0) {
                const candidate = { ...base, [listKey]: fullList.slice(0, keep), shown: keep };
                if (JSON.stringify(candidate).length <= maxBytes) {
                    return JSON.stringify(candidate);
                }
                keep = Math.floor(keep / 2) || 0;
                if (keep === 0) break;
            }

            const empty = { ...base, [listKey]: [], shown: 0 };
            return JSON.stringify(empty);
        }

        // No array to trim: drop the longest string fields until it fits.
        const clone = { ...base };
        const stringKeys = Object.keys(obj)
            .filter(key => typeof obj[key] === 'string')
            .sort((a, b) => (obj[b] || '').length - (obj[a] || '').length);

        for (const key of stringKeys) {
            clone[key] = String(obj[key]).slice(0, 200) + '…';
            if (JSON.stringify(clone).length <= maxBytes) return JSON.stringify(clone);
        }

        return JSON.stringify({ _truncated: true, _cut: true });
    }

    return JSON.stringify({ _truncated: true, _cut: true, preview: json.slice(0, Math.max(0, maxBytes - 80)) });
}

async function executeToolCall(ctx, toolName, rawArgs) {
    const toolDef = TOOL_MAP.get(toolName);
    if (!toolDef) {
        return {
            ok: false,
            status: 'unknown_tool',
            result: { error: `Tool "${toolName}" tidak terdaftar.` }
        };
    }

    const { identity } = ctx;
    if (!canExecuteTool(identity, toolDef)) {
        const reason = toolDef.kind === 'write'
            ? `Anda (${identity.name} - ${identity.role}) tidak memiliki izin tulis untuk menjalankan "${toolName}". Hubungi Superadmin jika memerlukan akses.`
            : `Peran Anda (${identity.role}) tidak memiliki izin untuk mengakses "${toolName}".`;
        return {
            ok: false,
            status: 'permission_denied',
            result: { error: reason }
        };
    }

    let parsedArgs = {};
    if (typeof rawArgs === 'string' && rawArgs.trim()) {
        try {
            parsedArgs = JSON.parse(rawArgs);
        } catch (err) {
            return {
                ok: false,
                status: 'invalid_args',
                result: { error: `Argumen JSON tidak valid: ${err.message}` }
            };
        }
    } else if (rawArgs && typeof rawArgs === 'object') {
        parsedArgs = rawArgs;
    }

    try {
        const output = await toolDef.run(ctx, parsedArgs);
        const isPending = output && output.status === 'confirmation_required';
        return {
            ok: !output?.error,
            status: isPending ? 'pending_confirmation' : (output?.error ? 'tool_error' : 'ok'),
            result: output
        };
    } catch (err) {
        return {
            ok: false,
            status: 'exception',
            result: { error: err.message || 'Terjadi kesalahan saat menjalankan tool.' }
        };
    }
}

module.exports = {
    ALL_TOOLS,
    TOOL_MAP,
    readTools,
    writeTools,
    resolvePaymentMethod,
    getToolsForIdentity,
    toOpenAiToolsSchema,
    truncateToolOutput,
    executeToolCall
};
