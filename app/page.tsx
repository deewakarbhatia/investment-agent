'use client'
import { useState, useRef } from 'react'
import type { AgentStep, VerdictOutput } from '@/lib/agent'

const EXAMPLES = ['Zomato', 'Reliance Industries', 'Infosys', 'Paytm', 'Tata Motors', 'HDFC Bank']

const SCORE_COLOR = (s: number) =>
  s >= 65 ? 'var(--accent)' : s >= 40 ? 'var(--yellow)' : 'var(--red)'

const NODE_LABELS: Record<string, string> = {
  INIT: 'INIT',
  RESEARCH: 'DISPATCH',
  FINANCIALS: 'FINANCIALS',
  NEWS: 'NEWS',
  COMPETITIVE: 'COMPETITIVE',
  RISK: 'RISK ANALYSIS',
  SYNTHESIS: 'SYNTHESIS',
  VERDICT: 'VERDICT',
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [verdict, setVerdict] = useState<VerdictOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function runAgent(company: string) {
    if (!company.trim() || loading) return
    setLoading(true)
    setSteps([])
    setVerdict(null)
    setError('')

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company }),
      })

      if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = JSON.parse(line.slice(6))
          if (payload.type === 'step') {
            setSteps(prev => [...prev, payload.step])
          } else if (payload.type === 'verdict') {
            setVerdict(payload.verdict)
          } else if (payload.type === 'error') {
            setError(payload.message)
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit() {
    if (query.trim()) runAgent(query.trim())
  }

  return (
    <>
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <div className="logo">
              <div className="logo-mark" />
              <div>
                <div className="logo-text">AlphaSignal</div>
                <div className="logo-sub">AI Research Engine</div>
              </div>
            </div>
            <div className="header-badge">v1.0 · Gemini + LangGraph</div>
          </div>
        </div>
      </header>

      <main>
        <div className="container">
          {/* Hero */}
          <section className="hero">
            <div className="hero-eyebrow">AI-Powered Investment Research</div>
            <h1 className="hero-title">
              Research any company.<br />
              Get an <span>invest or pass</span> signal.
            </h1>
            <p className="hero-desc">
              Enter a company name. The agent searches the web, pulls financials,
              news, and competitive data — then reasons through an investment decision.
            </p>
          </section>

          {/* Search */}
          <section className="search-section">
            <div className="search-box">
              <span className="search-prefix">COMPANY →</span>
              <input
                ref={inputRef}
                className="search-input"
                placeholder="e.g. Infosys, Tesla, Zomato..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                disabled={loading}
              />
              <button className="search-btn" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Researching...' : 'Analyse →'}
              </button>
            </div>

            {!verdict && !loading && (
              <div className="examples" style={{ marginTop: 20 }}>
                <div className="examples-label">Try an example</div>
                <div className="example-chips">
                  {EXAMPLES.map(ex => (
                    <button
                      key={ex}
                      className="example-chip"
                      onClick={() => { setQuery(ex); runAgent(ex) }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Error */}
          {error && (
            <div className="error-box">
              ✖ ERROR: {error}
            </div>
          )}

          {/* Agent Steps */}
          {steps.length > 0 && (
            <div className="agent-panel">
              <div className="panel-header">
                {loading && <div className="pulse-dot" />}
                <span className="panel-title">
                  {loading ? 'Agent running...' : 'Research complete'}
                </span>
              </div>
              <div className="steps-list">
                {steps.map((s, i) => (
                  <div className="step-item" key={i}>
                    <span className={`step-icon ${s.status}`}>
                      {s.status === 'done' ? '✓' : s.status === 'error' ? '✖' : '◎'}
                    </span>
                    <div className="step-content">
                      <div className="step-node">{NODE_LABELS[s.node] ?? s.node}</div>
                      <div className="step-text">{s.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verdict */}
          {verdict && (
            <div className={`verdict-panel verdict-${verdict.decision.toLowerCase()}`}>
              {/* Header */}
              <div className="verdict-header">
                <div>
                  <div className="verdict-label">Investment Verdict</div>
                  <div className="verdict-company">{verdict.company}</div>
                </div>
                <div className={`verdict-badge ${verdict.decision.toLowerCase()}`}>
                  {verdict.decision === 'INVEST' ? '▲ INVEST' : '▼ PASS'}
                </div>
              </div>

              {/* Score bar */}
              <div className="score-section">
                <div className="score-label">Attractiveness Score</div>
                <div className="score-bar-wrap">
                  <div
                    className="score-bar-fill"
                    style={{
                      width: `${verdict.score}%`,
                      background: SCORE_COLOR(verdict.score),
                    }}
                  />
                </div>
                <div className="score-val">{verdict.score} / 100</div>
              </div>

              {/* Metrics */}
              <div className="metrics-grid">
                {[
                  { name: 'Growth Outlook', val: verdict.metrics.growthOutlook },
                  { name: 'Market Position', val: verdict.metrics.competitivePosition },
                  { name: 'Financial Health', val: verdict.metrics.financialHealth },
                  { name: 'Risk Level', val: verdict.metrics.riskLevel },
                ].map(m => (
                  <div className="metric-cell" key={m.name}>
                    <div className="metric-name">{m.name}</div>
                    <div className={`metric-val ${
                      ['Strong', 'Leader', 'Low'].includes(m.val) ? 'green' :
                      ['Stressed', 'Very High', 'High'].includes(m.val) ? 'red' : 'yellow'
                    }`}>{m.val}</div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="reasoning-section">
                <div className="section-label">Analysis</div>
                <p className="reasoning-text">{verdict.summary}</p>
              </div>

              {/* Pros / Cons */}
              <div className="proscons-grid">
                <div className="pro-col">
                  <div className="pc-label">Bullish Factors</div>
                  {verdict.pros.map((p, i) => (
                    <div className="pc-item" key={i}>
                      <span className="pc-bullet">▲</span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
                <div className="con-col">
                  <div className="pc-label">Bearish Factors</div>
                  {verdict.cons.map((c, i) => (
                    <div className="pc-item" key={i}>
                      <span className="pc-bullet">▼</span>
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="verdict-footer">
                <p>⚠ {verdict.disclaimer}</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
