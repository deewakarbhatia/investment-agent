# AlphaSignal — AI Investment Research Agent

> Built for the InsideIIM × Altuni AI Labs AI Engineer Intern assignment.

🔴 **Live Demo:** [https://investment-agent-rouge.vercel.app](https://investment-agent-rouge.vercel.app)

---

## Overview

**AlphaSignal** is an AI-powered investment research agent that takes a company name as input, autonomously researches it across multiple dimensions, and delivers a structured **INVEST or PASS** verdict with reasoning.

The agent:
- Searches the web in real-time for financial data, news, competitive landscape, and risk factors
- Synthesizes findings into a coherent investment thesis using Gemini 1.5 Flash
- Outputs a scored verdict (0–100) with bullish/bearish factors, key metrics, and plain-English reasoning
- Streams agent reasoning steps live to the UI as it works

---

## How to Run

### Prerequisites
- Node.js 18+
- A free [Gemini API key](https://aistudio.google.com/app/apikey) (Google AI Studio)
- A free [Tavily API key](https://app.tavily.com) (1000 searches/month on free tier)

### Setup

```bash
# 1. Clone / unzip the project
cd investment-research-agent

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.local.example .env.local
# → Open .env.local and paste your GEMINI_API_KEY and TAVILY_API_KEY

# 4. Start the dev server
npm run dev

# 5. Open http://localhost:3000
```

### Production build

```bash
npm run build
npm start
```

### Deploy to Vercel (recommended)

```bash
npm i -g vercel
vercel
# Add GEMINI_API_KEY and TAVILY_API_KEY in Vercel dashboard → Settings → Environment Variables
```

---

## How It Works — Architecture

### Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) + React |
| Backend | Next.js API Route (Node.js runtime) |
| AI Orchestration | LangGraph.js |
| LLM | Google Gemini 1.5 Flash |
| Web Search | Tavily Search API |
| Streaming | Server-Sent Events (SSE) |

### Agent Architecture (LangGraph)

The agent is implemented as a **directed state graph** with 6 nodes:

```
START
  ├──▶ researchFinancials   (Tavily: revenue, earnings, financials)
  ├──▶ researchNews         (Tavily: latest news, strategy, products)
  ├──▶ researchCompetitors  (Tavily: market share, competitors)
  └──▶ researchRisks        (Tavily: risks, controversies, regulatory)
         │ (all 4 feed into →)
         ▼
     synthesiseAnalysis     (Gemini: synthesize into investment thesis)
         │
         ▼
     makeVerdict            (Gemini: structured JSON verdict)
         │
         ▼
        END
```

**Key design choices:**
- The 4 research nodes are dispatched as **parallel branches** in the LangGraph graph, minimizing latency
- The state uses `Annotation` reducers to accumulate data as parallel branches complete
- The final LLM call uses strict JSON output prompting to produce a machine-parseable verdict
- The API route uses **SSE streaming** so the UI can display each step as it completes, not just the final result

### State Schema
```typescript
{
  company: string,
  financialData: string,
  newsData: string,
  competitorData: string,
  riskData: string,
  analysis: string,
  verdict: VerdictOutput | null,
  steps: AgentStep[]
}
```

---

## Key Decisions & Trade-offs

### What I chose

**LangGraph over plain LangChain chains**: LangGraph's state graph model lets me express parallel research branches naturally and gives explicit control over execution flow. This makes the agent's reasoning transparent and extensible.

**Gemini 1.5 Flash**: Fast, free tier is generous (15 RPM, 1M tokens/day), and quality is strong enough for investment analysis synthesis. GPT-4o would produce marginally better prose but costs money and doesn't change the architecture.

**Tavily over SerpAPI/DuckDuckGo**: Tavily is purpose-built for LLM agents — it returns clean, structured results without boilerplate HTML noise. Native LangChain integration means zero custom parsing.

**SSE streaming over WebSockets**: SSE is simpler for a unidirectional server→client push. No need for a socket server; the Next.js API route handles it natively.

**Next.js monorepo**: Single codebase, zero CORS config, one-command Vercel deploy. The right call for a solo assignment.

### What I left out

- **Memory/caching**: Results are not cached. Running the same company twice re-runs all searches. With more time, I'd add Redis caching with a 1-hour TTL.
- **Real financial data APIs**: Tavily web search can find revenue/earnings mentions but can't pull structured P/E ratios or balance sheets. Integrating Yahoo Finance or Alpha Vantage APIs would add precision.
- **Historical comparison**: The agent doesn't compare the company against sector benchmarks or peers numerically. That would require a proper data source.
- **User history**: No persistence of past analyses. A simple SQLite or Postgres store would let users revisit previous verdicts.
- **Confidence calibration**: The 0-100 score is LLM-generated and not calibrated against actual market returns. It's a relative signal, not a backtested metric.

---

## Example Runs

### 1. Infosys — INVEST (Score: 74)

**Verdict:** INVEST  
**Summary:** Infosys shows stable revenue with a large and diversified global client base. Its investment in AI-led transformation services positions it well for the enterprise AI wave. Margin pressure from wage hikes and slower deal closures are near-term headwinds, but the long-term thesis remains intact.

| Metric | Value |
|--------|-------|
| Growth Outlook | Moderate |
| Market Position | Leader |
| Financial Health | Strong |
| Risk Level | Low |

**Bullish:** Strong free cash flow, consistent dividend, AI services buildout  
**Bearish:** Attrition concerns, discretionary IT spend slowdown, USD/INR exposure

---

### 2. Paytm — PASS (Score: 31)

**Verdict:** PASS  
**Summary:** Paytm continues to face severe regulatory and profitability challenges following RBI action on its payments bank. Despite its brand recognition, the path to sustainable profitability remains unclear and the regulatory risk is unusually high for a fintech of this size.

| Metric | Value |
|--------|-------|
| Growth Outlook | Weak |
| Market Position | Challenger |
| Financial Health | Stressed |
| Risk Level | Very High |

**Bullish:** Large user base, merchant network, brand recognition  
**Bearish:** RBI regulatory action, persistent losses, management credibility concerns

---

### 3. Tata Motors — INVEST (Score: 68)

**Verdict:** INVEST  
**Summary:** Tata Motors' turnaround is underpinned by Jaguar Land Rover's EV transition and strong domestic EV momentum with the Nexon EV. Commodity cost normalization has improved margins. Risks include JLR's execution on EV models and China market weakness.

| Metric | Value |
|--------|-------|
| Growth Outlook | Strong |
| Market Position | Leader |
| Financial Health | Stable |
| Risk Level | Medium |

**Bullish:** JLR EV pipeline, domestic market leadership, debt reduction  
**Bearish:** China exposure, EV infrastructure dependency, cyclical auto demand

---

## What I Would Improve With More Time

1. **Structured financial data**: Integrate a real financial data API (Yahoo Finance, Screener.in for Indian stocks) to pull hard numbers — P/E, revenue growth CAGR, debt/equity — rather than relying on web search mentions.

2. **Multi-agent debate**: Add a "bull" and "bear" agent that argue opposing cases before a "judge" agent delivers the final verdict. This would reduce single-model bias.

3. **Sector context**: Add a node that benchmarks the company against its sector average, so the score is relative rather than absolute.

4. **Redis caching**: Cache results by company name + date to avoid redundant API calls and reduce latency for repeated queries.

5. **Export to PDF**: Let users export the research report as a PDF — useful for sharing with others.

6. **Confidence intervals**: Add uncertainty quantification to the score (e.g., "68 ± 12") based on the quality and recency of sources found.

7. **Watchlist + alerts**: Persist verdicts and let users set up re-analysis alerts when a company's news spikes.

---

## AI Usage

This project was built using Claude (Anthropic) as the primary coding assistant. As required by the bonus criteria, the full LLM chat session transcript is included in `AI_CHAT_TRANSCRIPT.md`. The transcript covers the full development session including architecture decisions, implementation, debugging, and README writing.

All code in this submission was written with AI assistance and reviewed and understood by me. I can explain every decision made.

---

*Built by [Your Name] · InsideIIM AI Engineer Intern Assignment · June 2026*
