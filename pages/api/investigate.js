import { investigateCall } from '../../lib/genesys';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { conversationId } = req.body;
  if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId.trim())) {
    return res.status(400).json({ error: 'Invalid conversation ID format.' });
  }

  try {
    const result = await investigateCall(conversationId.trim().toLowerCase());
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
