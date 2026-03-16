const express = require('express');
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static('.'));

const NVIDIA_KEY  = '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';
const TAVILY_KEY  = process.env.TAVILY_KEY || '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';
const MODEL       = 'nvidia/llama-3.3-nemotron-super-49b-v1';
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';
const TAVILY_BASE = 'https://api.tavily.com/search';

const SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for real healthcare resources, clinics, phone numbers, and financial programs.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query. Include city/state for local results.' }
      },
      required: ['query']
    }
  }
};

// Single Tavily search — trimmed to keep context small
async function doSearch(query) {
  if (!TAVILY_KEY) return [{ title: 'No key', url: '', content: `No search configured: ${query}` }];
  try {
    const r = await fetch(TAVILY_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: TAVILY_KEY, query, max_results: 4, include_answer: true, search_depth: 'basic' })
    });
    const d = await r.json();
    const results = (d.results || []).map(r => ({
      title: (r.title || '').slice(0, 80),
      url: r.url || '',
      content: (r.content || '').slice(0, 300)
    }));
    if (d.answer) results.unshift({ title: 'Answer', url: '', content: d.answer.slice(0, 200) });
    console.log(`[SEARCH] "${query}" -> ${results.length} results`);
    return results.slice(0, 3);
  } catch(e) {
    console.error('[SEARCH]', e.message);
    return [{ title: 'Error', url: '', content: `Search failed: ${query}` }];
  }
}

app.post('/api/agent', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch(e) {} };

  const { messages, system } = req.body;
  if (!messages || !system) { send({ type: 'error', message: 'Invalid request' }); res.end(); return; }

  const sysMsg = [{ role: 'system', content: system }, ...messages];

  try {
    send({ type: 'thinking', text: 'Analyzing your situation...' });

    // ── No Tavily key: single confident call ─────────────────────────────────
    if (!TAVILY_KEY) {
      send({ type: 'thinking', text: 'Using training knowledge...' });

      const resp = await fetch(NVIDIA_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NVIDIA_KEY}` },
        body: JSON.stringify({ model: MODEL, messages: sysMsg, max_tokens: 3000, temperature: 0.6, stream: true })
      });
      if (!resp.ok) { const e = await resp.text(); send({ type: 'error', message: `API ${resp.status}: ${e.slice(0,200)}` }); res.end(); return; }

      send({ type: 'stream_start' });
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        const lines = dec.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const ev = JSON.parse(raw);
            const token = ev.choices?.[0]?.delta?.content || '';
            if (token) { full += token; send({ type: 'token', text: token }); }
          } catch(e) {}
        }
      }
      send({ type: 'done', searches: 0 });
      res.end(); return;
    }

    // ── Step 1: Ask Nemotron what to search (single planning call) ───────────
    send({ type: 'thinking', text: 'Planning searches...' });

    const planResp = await fetch(NVIDIA_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NVIDIA_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: sysMsg,
        max_tokens: 500,
        temperature: 0.3,
        tools: [SEARCH_TOOL],
        tool_choice: 'auto'
      })
    });

    if (!planResp.ok) { const e = await planResp.text(); send({ type: 'error', message: `Plan API ${planResp.status}: ${e.slice(0,200)}` }); res.end(); return; }
    const planData = await planResp.json();
    const planChoice = planData.choices?.[0];

    let queries = [];

    // Extract search queries from tool calls
    if (planChoice?.finish_reason === 'tool_calls' && planChoice.message?.tool_calls?.length) {
      for (const tc of planChoice.message.tool_calls) {
        try { const a = JSON.parse(tc.function.arguments); if (a.query) queries.push(a.query); } catch(e) {}
      }
    }

    // Fallback queries if model didn't use tools
    if (queries.length === 0) {
      const concern = messages[0]?.content || '';
      const locMatch = concern.match(/Location: (.+)/);
      const loc = locMatch?.[1]?.trim() || 'nearby';
      queries = [
        `FQHCs free clinics sliding scale ${loc}`,
        `financial assistance healthcare uninsured ${loc}`,
        `free telehealth low cost ${loc}`,
        `Medicaid enrollment help ${loc}`
      ];
    }

    // Cap at 4 queries
    queries = queries.slice(0, 4);

    // ── Step 2: Run ALL searches in PARALLEL ─────────────────────────────────
    send({ type: 'thinking', text: `Running ${queries.length} searches in parallel...` });
    queries.forEach(q => send({ type: 'search_start', query: q }));

    const searchResults = await Promise.all(queries.map(q => doSearch(q)));

    let searchCount = 0;
    queries.forEach((q, i) => {
      const count = searchResults[i].filter(r => r.url).length;
      send({ type: 'search_done', query: q, count });
      if (count > 0) searchCount++;
    });

    // ── Step 3: Build synthesis context ──────────────────────────────────────
    const searchContext = queries.map((q, i) =>
      `SEARCH: "${q}"\nRESULTS: ${JSON.stringify(searchResults[i])}`
    ).join('\n\n---\n\n');

    const synthesisMessages = [
      { role: 'system', content: system },
      ...messages,
      {
        role: 'user',
        content: `Here are the web search results to inform your response:\n\n${searchContext}\n\nNow provide the complete action plan using ONLY the required 8-section format. Include real names, addresses, and phone numbers from the search results where available.`
      }
    ];

    // ── Step 4: Stream the final synthesis ───────────────────────────────────
    send({ type: 'thinking', text: 'Writing your plan...' });

    const synthResp = await fetch(NVIDIA_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NVIDIA_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: synthesisMessages,
        max_tokens: 3000,
        temperature: 0.6,
        stream: true   // <-- STREAM so tokens appear immediately
      })
    });

    if (!synthResp.ok) { const e = await synthResp.text(); send({ type: 'error', message: `Synthesis API ${synthResp.status}: ${e.slice(0,200)}` }); res.end(); return; }

    send({ type: 'stream_start' });
    const reader = synthResp.body.getReader();
    const dec = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      const lines = dec.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const ev = JSON.parse(raw);
          const token = ev.choices?.[0]?.delta?.content || '';
          if (token) { fullText += token; send({ type: 'token', text: token }); }
          if (ev.choices?.[0]?.finish_reason === 'stop') {
            send({ type: 'done', searches: queries.length });
          }
        } catch(e) {}
      }
    }

    send({ type: 'done', searches: queries.length });

  } catch(err) {
    console.error('[AGENT]', err);
    send({ type: 'error', message: err.message });
  }

  res.end();
});

// Simple proxy for chat + call script
app.post('/api/chat', async (req, res) => {
  try {
    const resp = await fetch(NVIDIA_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NVIDIA_KEY}` },
      body: JSON.stringify(req.body)
    });
    res.setHeader('Content-Type', 'text/event-stream');
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      res.write(dec.decode(value, { stream: true }));
    }
    res.end();
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('\n  HealthBridge -> http://localhost:3000');
  console.log(TAVILY_KEY ? '  Search: ACTIVE (parallel)' : '  Search: off (add TAVILY_KEY=... to enable)');
  console.log('');
});