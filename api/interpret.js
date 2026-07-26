import { APP_KNOWLEDGE_BASE } from './info.js';

// ── Per-IP rate limit ─────────────────────────────────────
const ipMap = new Map();
function isRateLimited(ip) {
    const now = Date.now();
    const WINDOW = 60_000;
    const MAX = 15;
    const d = ipMap.get(ip);
    if (!d || now - d.start > WINDOW) { ipMap.set(ip, { count: 1, start: now }); return false; }
    if (d.count >= MAX) return true;
    d.count++;
    return false;
}
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of ipMap.entries()) if (now - v.start > 120_000) ipMap.delete(k);
}, 120_000);

// ── Stats ─────────────────────────────────────────────────
async function saveStats(inputTokens, outputTokens) {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return;
    const now      = new Date();
    const dateKey  = now.toISOString().slice(0, 10);
    const monthKey = now.toISOString().slice(0, 7);
    const total    = (inputTokens || 0) + (outputTokens || 0);
    const cmds = [
        ['INCR',   `stats:searches:daily:${dateKey}`],
        ['INCR',   `stats:searches:monthly:${monthKey}`],
        ['INCR',   'stats:searches:total'],
        ['INCRBY', `stats:tokens:daily:${dateKey}`,    total],
        ['INCRBY', `stats:tokens:monthly:${monthKey}`, total],
        ['INCRBY', 'stats:tokens:total',               total],
        ['EXPIRE', `stats:searches:daily:${dateKey}`,  7776000],
        ['EXPIRE', `stats:tokens:daily:${dateKey}`,    7776000],
    ];
    try {
        await fetch(`${url}/pipeline`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(cmds)
        });
    } catch (e) {}
}

async function trackVisitor(ip) {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return;
    const dateKey  = new Date().toISOString().slice(0, 10);
    const monthKey = new Date().toISOString().slice(0, 7);
    try {
        await fetch(`${url}/pipeline`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([
                ['PFADD', `stats:visitors:daily:${dateKey}`,    ip],
                ['PFADD', `stats:visitors:monthly:${monthKey}`, ip],
                ['PFADD', 'stats:visitors:total',                ip],
                ['EXPIRE', `stats:visitors:daily:${dateKey}`,  7776000],
            ])
        });
    } catch (e) {}
}

// ── System Prompt ─────────────────────────────────────────
const SYSTEM_PROMPT = `You are "Dream Lens" — an expert AI dream analyst. Creator: Rahul Dev (Dev-Onix).

${APP_KNOWLEDGE_BASE}

━━━━ RULES ━━━━

① Identity questions ("who are you", "who made you", etc.):
→ Reply: "I am Dream Lens — an AI dream analyst created by independent developer Rahul Dev."

② Dream-related general questions ("what is a dream", "why do we dream"):
→ Answer briefly using scientific and ancient knowledge.

③ Completely off-topic questions (coding, math, cooking, etc.):
→ Reply: "Sorry, I am only designed for dream analysis."

━━━━ ANALYSIS RULES ━━━━

- Always respond in Bengali (বাংলা).
- Use ancient dream lore, mythological traditions, and modern psychology (Jung, Freud) for symbol analysis.
- NEVER mention any religion, religious scripture, or religious terminology.
- Use universal language like "ancient dream lore", "traditional wisdom", "cultural traditions".
- Responses must be universal — comfortable for people of any religion or no religion.
- Never spread fear or superstition.
- State future possibilities, never certainties.
- Keep responses concise but meaningful (150–220 words max).
- Remember previous conversation and connect with new dreams.
- No unnecessary introduction or repetition.

━━━━ RESPONSE FORMAT ━━━━

🌙 **Dream Message**
1–2 sentences. Core meaning directly. No introduction.

🔍 **Symbol Analysis**
• Bullet points for each key symbol — ancient lore + psychology. No religion names.

🔮 **Life Connection & Advice**
• What area of life this dream may relate to (relationship, work, mind, family).
• Practical, universal advice.

❓ **Questions for You**
1–2 focused questions to deepen the analysis.`;

// ── Main handler ──────────────────────────────────────────
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
             || req.socket?.remoteAddress || 'unknown';

    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests. Please wait 1 minute.' });
    }

    const { dream, history } = req.body || {};

    if (!dream || typeof dream !== 'string' || dream.trim().length < 2) {
        return res.status(400).json({ error: 'Please write your dream or question.' });
    }
    if (dream.length > 2000) {
        return res.status(400).json({ error: 'Please keep it under 2000 characters.' });
    }

    const KEYS = [
        process.env.GROQ_API_KEY_1,
        process.env.GROQ_API_KEY_2,
        process.env.GROQ_API_KEY_3,
    ].filter(Boolean);

    if (KEYS.length === 0) return res.status(500).json({ error: 'Server configuration error' });

    const start = Math.floor(Math.random() * KEYS.length);
    const keys  = [...KEYS.slice(start), ...KEYS.slice(0, start)];

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (Array.isArray(history) && history.length > 0) {
        for (const msg of history.slice(-4)) {
            if (msg.role === 'user') messages.push({ role: 'user', content: msg.text });
            else if (msg.role === 'ai') messages.push({ role: 'assistant', content: msg.text });
        }
    }
    messages.push({ role: 'user', content: dream.trim() });

    trackVisitor(ip).catch(() => {});

    for (let i = 0; i < keys.length; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 28000);

            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${keys[i]}`
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages,
                    temperature: 0.7,
                    max_tokens: 1500
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (groqRes.status === 429 || groqRes.status === 503) continue;

            if (!groqRes.ok) {
                const err = await groqRes.json().catch(() => ({}));
                throw new Error(err?.error?.message || `Groq error ${groqRes.status}`);
            }

            const data = await groqRes.json();
            const text = data?.choices?.[0]?.message?.content?.trim();
            if (!text) throw new Error('Empty response');

            const usage = data.usage || {};
            saveStats(usage.prompt_tokens || 0, usage.completion_tokens || 0).catch(() => {});

            return res.status(200).json({ text });

        } catch (e) {
            if (e.name === 'AbortError') {
                if (i < keys.length - 1) continue;
                return res.status(504).json({ error: 'AI server timed out. Please try again.' });
            }
            if (i < keys.length - 1) continue;
            return res.status(500).json({ error: `AI error: ${e.message}` });
        }
    }

    return res.status(429).json({ error: 'All API keys exhausted. Please try again later.' });
                      }
