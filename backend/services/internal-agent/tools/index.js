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

function truncateToolOutput(obj, maxBytes = 2400) {
    const json = JSON.stringify(obj);
    if (json.length <= maxBytes) return json;
    if (obj && typeof obj === 'object') {
        const clone = { ...obj, _truncated: true };
        for (const key of Object.keys(clone)) {
            if (Array.isArray(clone[key]) && clone[key].length > 5) {
                clone[key] = clone[key].slice(0, 5);
            }
        }
        const retry = JSON.stringify(clone);
        if (retry.length <= maxBytes) return retry;
        return retry.slice(0, maxBytes - 20) + '..."_cut":true}';
    }
    return json.slice(0, maxBytes);
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
