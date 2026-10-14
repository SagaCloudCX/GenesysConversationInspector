import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [convId, setConvId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function investigate() {
    const id = convId.trim();
    if (!id) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head><title>GenesysCloud Conversation Analysis</title></Head>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🔍</span>
            <span>GenesysCloud Conversation Analysis</span>
          </div>
          <span className={styles.badge}>Saga Cloud CX</span>
        </header>

        <main className={styles.main}>
          <div className={styles.searchCard}>
            <label className={styles.label}>Conversation ID</label>
            <div className={styles.inputRow}>
              <input
                className={styles.input}
                type="text"
                placeholder="fd6836d5-fa8b-4f8f-a37e-3eaf4877b7bf"
                value={convId}
                onChange={e => setConvId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && investigate()}
                spellCheck={false}
              />
              <button className={styles.btn} onClick={investigate} disabled={loading || !convId.trim()}>
                {loading ? 'Učitavam…' : 'Istraži'}
              </button>
            </div>
            <p className={styles.hint}>Conversation ID pronađite u Genesys Admin → Performance → Interactions → URL ili detalji poziva.</p>
          </div>

          {error && <div className={styles.errorBox}>⚠ {error}</div>}

          {result && <Report data={result} />}
        </main>
      </div>
    </>
  );
}

function Report({ data }) {
  const { analytics, convObj, flowData, recordings } = data;
  return (
    <div className={styles.report}>
      {analytics ? (
        <Section title="📊 CDR — Detalji razgovora">
          <Row label="Conversation ID" value={analytics.conversationId} mono />
          <Row label="Početak" value={analytics.start} />
          <Row label="Kraj" value={analytics.end} />
          <Row label="Trajanje" value={analytics.duration} />
          <Row label="Smer" value={analytics.direction} />
          {analytics.mos && <Row label="Min MOS" value={`${analytics.mos} / 5.0`} highlight={parseFloat(analytics.mos) < 4.0} />}

          {analytics.participants.map((p, i) => (
            <div key={i} className={styles.participant}>
              <div className={styles.participantTitle}>{p.purpose.toUpperCase()}</div>
              {p.ani && <Row label="ANI" value={p.ani} />}
              {p.dnis && !p.dnis.startsWith('sip:') && <Row label="DNIS" value={p.dnis} />}
              {p.recording && <Row label="Snimak" value="DA" />}
              {p.metrics.length > 0 && (
                <div className={styles.metrics}>
                  {p.metrics.map((m, j) => <span key={j} className={styles.metric}>{m.name}: {m.value}</span>)}
                </div>
              )}
              {p.segments.length > 0 && (
                <div className={styles.segments}>
                  {p.segments.map((s, j) => (
                    <div key={j} className={styles.segment}>
                      <span className={styles.segType}>{s.type}</span>
                      <span className={styles.segTime}>{s.start} → {s.end}</span>
                      {s.queue && <span className={styles.segMeta}>queue: {s.queue}</span>}
                      {s.flow && <span className={styles.segMeta}>flow: {s.flow}</span>}
                      {s.disconnect && <span className={styles.segMeta}>disconnect: {s.disconnect}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Section>
      ) : (
        <Section title="📊 CDR">
          <p className={styles.noData}>Nije pronađen zapis. Poziv je možda stariji od 31 dan ili ID nije ispravan.</p>
        </Section>
      )}

      {convObj && (
        <Section title="📞 Conversation Object">
          <Row label="Početak" value={convObj.start} />
          <Row label="Kraj" value={convObj.end} />
          <Row label="Adresa" value={convObj.address} mono />
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Uloga</span><span>Ime</span><span>ANI</span><span>Vreme</span><span>Disconnect</span>
            </div>
            {convObj.participants.map((p, i) => (
              <div key={i} className={styles.tableRow}>
                <span className={styles.purpose}>{p.purpose}</span>
                <span>{p.name}</span>
                <span>{p.ani || '—'}</span>
                <span>{p.startTime}</span>
                <span>{p.disconnectType || '—'}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="🔁 Flow Execution History">
        {flowData === '_forbidden'
          ? <p className={styles.warn}>403 — OAuth clientu nedostaju Architect permisije (Flow Instance View/Search).</p>
          : flowData?.length
            ? flowData.map((f, i) => (
              <div key={i} className={styles.participant}>
                <div className={styles.participantTitle}>{f.flowName} v{f.flowVersion} ({f.flowType})</div>
                <Row label="Početak" value={f.start} />
                <Row label="Kraj" value={f.end} />
                {f.error && <Row label="Greška" value={f.error} highlight />}
              </div>
            ))
            : <p className={styles.noData}>Nema podataka (potrebno: org-level execution data + Flow Instance permisije, retention 10 dana).</p>
        }
      </Section>

      <Section title="🎙 Snimci">
        {recordings === '_forbidden'
          ? <p className={styles.warn}>403 — OAuth clientu nedostaju Recording permisije.</p>
          : recordings?.length
            ? recordings.map((r, i) => (
              <div key={i} className={styles.participant}>
                <Row label="ID" value={r.id} mono />
                <Row label="Status" value={r.state} />
                <Row label="Tip" value={r.mediaType} />
                <Row label="Trajanje" value={r.duration} />
                <Row label="Početak" value={r.start} />
              </div>
            ))
            : <p className={styles.noData}>Nema snimaka ili snimak još nije obrađen.</p>
        }
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value, mono, highlight }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={`${styles.rowValue} ${mono ? styles.mono : ''} ${highlight ? styles.highlight : ''}`}>{value}</span>
    </div>
  );
}
