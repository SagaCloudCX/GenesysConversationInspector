const REGION = process.env.GENESYS_REGION || 'mypurecloud.ie';
const CLIENT_ID = process.env.GENESYS_CLIENT_ID;
const CLIENT_SECRET = process.env.GENESYS_CLIENT_SECRET;

export async function getAccessToken() {
  const res = await fetch(`https://login.${REGION}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export function apiBase() {
  return `https://api.${REGION}`;
}

export async function genesysGet(token, path, params = {}) {
  const url = new URL(apiBase() + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (res.status === 403) return { _forbidden: true, path };
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function genesysPost(token, path, body) {
  const res = await fetch(apiBase() + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 403) return { _forbidden: true, path };
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

function fmtTs(ts) {
  if (!ts) return 'N/A';
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function fmtMs(ms) {
  if (ms == null) return 'N/A';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtDuration(start, end) {
  if (!start || !end) return 'N/A';
  const sec = Math.round((new Date(end) - new Date(start)) / 1000);
  const m = Math.floor(sec / 60);
  return `${m}m ${sec % 60}s (${sec}s)`;
}

export async function investigateCall(convId) {
  const token = await getAccessToken();

  const now = new Date();
  const interval = `${new Date(now - 31 * 86400000).toISOString()}/${now.toISOString()}`;

  // 1. Analytics CDR
  let analytics = null;
  const analyticsResp = await genesysPost(token, '/api/v2/analytics/conversations/details/query', {
    interval,
    conversationFilters: [{
      type: 'and',
      predicates: [{ type: 'dimension', dimension: 'conversationId', operator: 'matches', value: convId }],
    }],
    paging: { pageSize: 1, pageNumber: 1 },
  });
  const conv = analyticsResp?.conversations?.[0] || null;

  if (conv) {
    const participants = (conv.participants || []).map(p => {
      const sessions = p.sessions || [];
      const segs = sessions.flatMap(s => (s.segments || []).map(seg => ({
        type: seg.segmentType,
        start: seg.segmentStart ? new Date(seg.segmentStart).toISOString().slice(11, 19) : '?',
        end: seg.segmentEnd ? new Date(seg.segmentEnd).toISOString().slice(11, 19) : '?',
        queue: seg.queueName || null,
        flow: seg.flowName || null,
        disconnect: seg.disconnectType || null,
      })));
      const metrics = sessions.flatMap(s => (s.metrics || [])
        .filter(m => m.value && m.value !== 0)
        .map(m => ({ name: m.name, value: String(m.name).startsWith('t') ? fmtMs(m.value) : m.value }))
      );
      const firstSession = sessions[0] || {};
      return {
        purpose: p.purpose,
        participantId: p.participantId,
        userId: p.userId || null,
        ani: (firstSession.ani || '').replace('tel:', ''),
        dnis: (firstSession.dnis || '').replace('tel:', ''),
        recording: sessions.some(s => s.recording),
        segments: segs,
        metrics,
      };
    });

    analytics = {
      conversationId: conv.conversationId,
      start: fmtTs(conv.conversationStart),
      end: fmtTs(conv.conversationEnd),
      duration: fmtDuration(conv.conversationStart, conv.conversationEnd),
      direction: conv.originatingDirection || 'N/A',
      mos: conv.mediaStatsMinConversationMos ? conv.mediaStatsMinConversationMos.toFixed(2) : null,
      participants,
    };
  }

  // 2. Conversation object
  let convObj = null;
  const rawConv = await genesysGet(token, `/api/v2/conversations/${convId}`);
  if (rawConv && !rawConv._forbidden) {
    convObj = {
      start: fmtTs(rawConv.startTime),
      end: fmtTs(rawConv.endTime),
      address: rawConv.address || 'N/A',
      participants: (rawConv.participants || []).map(p => ({
        purpose: p.purpose,
        name: p.name || '',
        ani: (p.ani || '').replace('tel:', ''),
        disconnectType: p.disconnectType || '',
        startTime: p.startTime ? new Date(p.startTime).toISOString().slice(11, 19) : '',
      })),
    };
  }

  // 3. Flow execution (may be 403)
  let flowData = null;
  const flowResp = await genesysPost(token, '/api/v2/flows/instances/query', {
    query: [{ and: [{ key: 'ConversationId', operator: 'eq', value: convId }] }],
  });
  if (flowResp && !flowResp._forbidden && flowResp.entities?.length) {
    flowData = flowResp.entities.map(e => ({
      flowName: e.flowName,
      flowVersion: e.flowVersion,
      flowType: e.flowType,
      start: fmtTs(e.startDateTime),
      end: fmtTs(e.endDateTime),
      error: e.flowErrorReason || null,
    }));
  } else if (flowResp?._forbidden) {
    flowData = '_forbidden';
  }

  // 4. Recordings (may be 403)
  let recordings = null;
  const recResp = await genesysGet(token, `/api/v2/conversations/${convId}/recordings`, { maxWaitMs: 5000 });
  if (recResp && !recResp._forbidden) {
    const recs = Array.isArray(recResp) ? recResp : (recResp.entities || []);
    recordings = recs.map(r => ({
      id: r.id,
      state: r.fileState || r.state || 'N/A',
      mediaType: r.media || r.mediaType || 'N/A',
      duration: fmtMs(r.durationMs),
      start: fmtTs(r.startTime),
      end: fmtTs(r.endTime),
    }));
  } else if (recResp?._forbidden) {
    recordings = '_forbidden';
  }

  return { convId, analytics, convObj, flowData, recordings };
}
