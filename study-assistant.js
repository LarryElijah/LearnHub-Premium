const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sign in to use the study assistant.' });
  const { SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
    return res.status(503).json({ error: 'The study assistant is not configured yet. Set the server environment variables.' });
  }
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Your session is invalid. Please sign in again.' });
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question || question.length > 4000) return res.status(400).json({ error: 'Enter a question between 1 and 4000 characters.' });
    const incoming = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];
    const history = incoming.filter(m => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string').map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.5, max_tokens: 900,
        messages: [
          { role: 'system', content: 'You are LearnHub Study Buddy, a supportive educational assistant for secondary-school students. Explain concepts clearly, safely, and age-appropriately. Prefer step-by-step explanations, examples, hints, and learning checks over simply doing assessed work for the student. If uncertain, say so and encourage checking a textbook or teacher. Do not request personal or sensitive information.' },
          ...history,
          { role: 'user', content: question }
        ]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('AI provider error status:', response.status);
      return res.status(502).json({ error: 'The study assistant could not answer just now. Please try again shortly.' });
    }
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) return res.status(502).json({ error: 'No answer was returned. Please try again.' });
    return res.status(200).json({ answer });
  } catch (err) {
    console.error('Study assistant request failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong while preparing your answer.' });
  }
};
