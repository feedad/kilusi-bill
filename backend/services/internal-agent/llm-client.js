const axios = require('axios');
const { query } = require('../../config/database');
const logger = require('../../config/logger');
const { getSetting, updateSetting } = require('../../config/settingsManager');

function getTodayWibString(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    if (year && month && day) {
        return `${year}-${month}-${day}`;
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function getAgentConfig() {
    let baseUrl = getSetting('ai_agent_llm_base_url', '');
    let apiKey = getSetting('ai_agent_llm_api_key', '');
    let model = getSetting('ai_agent_llm_model', 'Whatsapp');
    let enabled = getSetting('ai_agent_enabled', false);
    let dailyBudget = Number(getSetting('ai_agent_daily_token_budget', 2000000));

    if (!baseUrl || !apiKey) {
        try {
            const res = await query(
                `SELECT key, value FROM app_config WHERE key IN (
                    'ai_agent_enabled',
                    'ai_agent_llm_base_url',
                    'ai_agent_llm_api_key',
                    'ai_agent_llm_model',
                    'ai_agent_daily_token_budget'
                )`
            );
            const map = {};
            for (const row of res.rows || []) {
                map[row.key] = row.value;
            }
            if (map.ai_agent_llm_base_url) baseUrl = map.ai_agent_llm_base_url;
            if (map.ai_agent_llm_api_key !== undefined) apiKey = map.ai_agent_llm_api_key;
            if (map.ai_agent_llm_model) model = map.ai_agent_llm_model;
            if (map.ai_agent_enabled !== undefined) {
                enabled = map.ai_agent_enabled === 'true' || map.ai_agent_enabled === '1' || map.ai_agent_enabled === true;
            }
            if (map.ai_agent_daily_token_budget !== undefined) {
                dailyBudget = Number(map.ai_agent_daily_token_budget) || 2000000;
            }
        } catch (err) {
            logger.warn(`[InternalAgent] Failed reading app_config fallback: ${err.message}`);
        }
    } else {
        enabled = enabled === true || enabled === 'true' || enabled === '1';
    }

    const effectiveBudget = Number.isFinite(dailyBudget) && dailyBudget > 0 ? dailyBudget : 2000000;
    return {
        enabled: Boolean(enabled),
        baseUrl: String(baseUrl || 'http://172.22.10.201:20128/v1').trim().replace(/\/+$/, ''),
        apiKey: String(apiKey || '').trim(),
        model: String(model || 'Whatsapp').trim(),
        dailyBudget: effectiveBudget,
        dailyTokenBudget: effectiveBudget
    };
}

async function getDailyTokenUsage(dateStr = getTodayWibString()) {
    const cfg = await getAgentConfig();
    const key = `ai_agent_tokens.${dateStr}`;
    let used = 0;

    try {
        const res = await query(`SELECT value FROM app_config WHERE key = $1`, [key]);
        if (res.rows && res.rows.length > 0) {
            used = parseInt(res.rows[0].value, 10) || 0;
        } else {
            used = parseInt(getSetting(key, 0), 10) || 0;
        }
    } catch (err) {
        used = parseInt(getSetting(key, 0), 10) || 0;
    }

    const budget = cfg.dailyBudget;
    return {
        date: dateStr,
        used,
        budget,
        remaining: Math.max(0, budget - used),
        exceeded: used >= budget
    };
}

async function addDailyTokenUsage(tokensDelta, dateStr = getTodayWibString()) {
    const delta = Math.max(0, parseInt(tokensDelta, 10) || 0);
    if (delta === 0) return;

    const key = `ai_agent_tokens.${dateStr}`;
    try {
        const res = await query(
            `INSERT INTO app_config (key, value, type, category, description, updated_at)
             VALUES ($1, $2, 'number', 'ai_agent', 'Pemakaian token harian Asisten AI', CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE
             SET value = (COALESCE(NULLIF(app_config.value, '')::bigint, 0) + $2::bigint)::text,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING value`,
            [key, String(delta)]
        );
        const newVal = parseInt(res.rows?.[0]?.value, 10) || delta;
        await updateSetting(key, newVal).catch(() => {});
    } catch (err) {
        logger.warn(`[InternalAgent] Failed updating token counter ${key}: ${err.message}`);
    }
}

function parseCompletionPayload(data) {
    if (data && typeof data === 'object' && Array.isArray(data.choices)) {
        return data;
    }
    if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.startsWith('{')) {
            return JSON.parse(trimmed);
        }
        // Fallback if upstream ever returns SSE lines despite stream:false
        const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.startsWith('data:'));
        let content = '';
        let role = 'assistant';
        const toolCallsMap = new Map();
        let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        for (const line of lines) {
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
                const chunk = JSON.parse(raw);
                if (chunk.usage) usage = chunk.usage;
                const delta = chunk.choices?.[0]?.delta || chunk.choices?.[0]?.message;
                if (!delta) continue;
                if (delta.role) role = delta.role;
                if (delta.content) content += delta.content;
                if (Array.isArray(delta.tool_calls)) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        if (!toolCallsMap.has(idx)) {
                            toolCallsMap.set(idx, {
                                id: tc.id || `call_${idx}`,
                                type: 'function',
                                function: { name: '', arguments: '' }
                            });
                        }
                        const entry = toolCallsMap.get(idx);
                        if (tc.id) entry.id = tc.id;
                        if (tc.function?.name) entry.function.name += tc.function.name;
                        if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
                    }
                }
            } catch (_) {
                // ignore malformed SSE chunk
            }
        }

        const message = { role, content: content || null };
        if (toolCallsMap.size > 0) {
            message.tool_calls = Array.from(toolCallsMap.values());
        }
        return {
            choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }],
            usage
        };
    }
    throw new Error('Format respons LLM tidak dikenali');
}

function shouldRetryError(err) {
    const status = err?.response?.status;
    if (status === 429 || (status >= 500 && status <= 599)) return true;
    const code = err?.code;
    return code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN';
}

async function chatCompletion({ model, messages, tools = [], toolChoice, tool_choice, temperature = 0.2, overrideConfig = null }) {
    const cfg = overrideConfig ? { ...(await getAgentConfig()), ...overrideConfig } : await getAgentConfig();
    const usageState = await getDailyTokenUsage();

    if (usageState.exceeded) {
        const budgetErr = new Error('Asisten sedang mencapai batas harian');
        budgetErr.code = 'TOKEN_BUDGET_EXCEEDED';
        throw budgetErr;
    }

    const url = `${cfg.baseUrl}/chat/completions`;
    const headers = {
        'Content-Type': 'application/json'
    };
    if (cfg.apiKey) {
        headers.Authorization = `Bearer ${cfg.apiKey}`;
    }

    const payload = {
        model: model || cfg.model,
        messages,
        temperature,
        stream: false
    };

    if (Array.isArray(tools) && tools.length > 0) {
        payload.tools = tools;
        payload.tool_choice = toolChoice || tool_choice || 'auto';
    }

    const startedAt = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await axios.post(url, payload, {
                headers,
                timeout: 30000
            });
            const parsed = parseCompletionPayload(response.data);
            const choice = parsed.choices?.[0];
            if (!choice || !choice.message) {
                throw new Error('Respons LLM kosong');
            }

            const tokensIn = Number(parsed.usage?.prompt_tokens) || 0;
            const tokensOut = Number(parsed.usage?.completion_tokens) || 0;
            const totalTokens = Number(parsed.usage?.total_tokens) || (tokensIn + tokensOut);

            await addDailyTokenUsage(totalTokens);

            return {
                message: choice.message,
                finishReason: choice.finish_reason || 'stop',
                tokensIn,
                tokensOut,
                totalTokens,
                usage: {
                    prompt_tokens: tokensIn,
                    completion_tokens: tokensOut,
                    total_tokens: totalTokens
                },
                latencyMs: Date.now() - startedAt,
                model: parsed.model || model || cfg.model
            };
        } catch (err) {
            lastError = err;
            if (attempt === 0 && shouldRetryError(err)) {
                await new Promise(resolve => setTimeout(resolve, 600));
                continue;
            }
            break;
        }
    }

    const detail = lastError?.response?.data?.error?.message || lastError?.message || 'LLM request failed';
    const wrapped = new Error(detail);
    wrapped.code = lastError?.code || 'LLM_REQUEST_FAILED';
    wrapped.status = lastError?.response?.status;
    throw wrapped;
}

async function listModels(override = {}) {
    const cfg = await getAgentConfig();
    const baseUrl = String(override.baseUrl || cfg.baseUrl).trim().replace(/\/+$/, '');
    const apiKey = override.apiKey !== undefined && override.apiKey !== '' ? String(override.apiKey).trim() : cfg.apiKey;

    const headers = {};
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await axios.get(`${baseUrl}/models`, {
        headers,
        timeout: 10000
    });

    const rawList = Array.isArray(response.data?.data) ? response.data.data : [];
    const mapped = rawList.map(item => ({
        id: item.id,
        owned_by: item.owned_by || 'custom'
    }));
    if (!mapped.some(m => m.id === 'cx/gpt-5.4')) {
        mapped.unshift({ id: 'cx/gpt-5.4', owned_by: 'cx' });
    }
    return mapped;
}

module.exports = {
    getTodayWibString,
    getAgentConfig,
    getDailyTokenUsage,
    addDailyTokenUsage,
    chatCompletion,
    listModels
};
