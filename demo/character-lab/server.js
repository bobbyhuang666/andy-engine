/**
 * Andy Character Lab - Demo Server (v2: 自由事件输入)
 */

const express = require('express');
const path = require('path');
const CharacterAdapter = require('./character-adapter');
const EVENT_POOL = require('./events');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let adapter = new CharacterAdapter();

// GET /api/state — 初始状态
app.get('/api/state', (req, res) => {
  try { res.json({ ok: true, state: adapter.getState() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/events — 事件池
app.get('/api/events', (req, res) => {
  res.json({
    ok: true,
    events: EVENT_POOL.map(e => ({
      id: e.id, label: e.label, description: e.description,
    })),
  });
});

// POST /api/event — 触发事件，返回状态+回复+因果解释
app.post('/api/event', (req, res) => {
  try {
    const { eventId } = req.body;
    const eventDef = EVENT_POOL.find(e => e.id === eventId);
    if (!eventDef) return res.status(400).json({ ok: false, error: '事件不存在' });
    const result = adapter.triggerEvent(eventDef);
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/reset
app.post('/api/reset', (req, res) => {
  try { res.json({ ok: true, state: adapter.reset() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`\n  Andy Character Lab → http://localhost:${PORT}\n`);
});

