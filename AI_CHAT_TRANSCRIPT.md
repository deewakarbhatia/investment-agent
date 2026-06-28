# AI Chat Session Transcript — AlphaSignal Investment Agent
*Tool used: Claude (Anthropic) — claude.ai*  
*Date: June 2026*  
*Purpose: Full development session log for InsideIIM assignment bonus criteria*

---

## Session Overview

This document logs the complete AI-assisted development session for the AlphaSignal investment research agent. The session covered architecture planning, tech stack selection, implementation, and documentation.

---

## Turn 1 — Reading the Assignment

**Me:** [Uploaded PDF of assignment]  
Okay I have an assignment from InsideIIM for AI Engineer Intern. The task is to build an AI Investment Research Agent. Stack is React/Next.js, Node.js, LangChain.js / LangGraph.js. What's the best approach?

**Claude:**  
This is a solid assignment. Let me break down exactly what you need to build and how to approach it.

They want an AI Investment Research Agent — input a company name, it researches the company, and outputs an invest/pass decision with reasoning.

For the stack, I'd recommend:
- **Next.js** — single codebase, API routes built-in, deploys to Vercel in one click. Best choice here.
- **Google Gemini 1.5 Flash** — free tier is generous, fast, perfect fit.
- **LangGraph.js** — they specifically mentioned it and it's the more impressive choice over plain LangChain. Shows you understand agentic workflows.
- **Tavily API** — free tier web search API, purpose-built for LLM agents, native LangChain integration.

Architecture plan: LangGraph state graph with parallel research branches feeding into a synthesis node, then a verdict node. SSE streaming for live step display on the frontend.

---

## Turn 2 — Architecture Decision

**Me:** Why LangGraph specifically over just using LangChain with a ReAct agent?

**Claude:**  
Great question — this is worth thinking through carefully.

A **ReAct agent** (LangChain's default agent pattern) works by having the LLM decide what to do next at each step: it looks at the current state, picks a tool, observes the result, then loops. This is flexible but has two problems here: (1) it runs tools sequentially, so 4 searches take 4× longer than necessary, and (2) the execution path is non-deterministic — the LLM might decide to stop early or run unnecessary extra searches.

**LangGraph** lets you define the execution flow explicitly as a directed graph. I can say "run these 4 nodes in parallel from START, then when all 4 complete, proceed to synthesis." This is both faster and more predictable. For an assignment where they'll review your code, a LangGraph graph also makes your agent's architecture immediately readable — the graph topology is the documentation.

The interviewers who work with LangGraph daily will recognize the pattern immediately. It's the right tool for a structured multi-step research workflow.

---

## Turn 3 — State Design

**Me:** How should I design the LangGraph state? What goes in it?

**Claude:**  
The state needs to carry everything the agent learns as it executes, since each node receives the full state and returns partial updates.

I'd structure it like:

```typescript
{
  company: string,           // Input: the company being researched
  financialData: string,     // Output of researchFinancials node
  newsData: string,          // Output of researchNews node
  competitorData: string,    // Output of researchCompetitors node
  riskData: string,          // Output of researchRisks node
  analysis: string,          // Output of synthesiseAnalysis node (LLM synthesis)
  verdict: VerdictOutput,    // Output of makeVerdict node (structured JSON)
  steps: AgentStep[]         // Accumulated step log for frontend display
}
```

The `steps` array uses a reducer (`(a, b) => [...a, ...b]`) so each node can append its step without overwriting others — important when nodes run in parallel.

The `verdict` has a typed interface with `decision`, `score`, `pros`, `cons`, and `metrics` — this makes the frontend predictable and avoids parsing free-form LLM text in the UI.

---

## Turn 4 — Parallel Execution in LangGraph

**Me:** How do I actually make nodes run in parallel in LangGraph? I've only seen sequential examples.

**Claude:**  
Parallel execution in LangGraph is done by adding multiple edges from the same source node — when a node has multiple outgoing edges to different nodes, LangGraph executes those target nodes in parallel and waits for all to complete before proceeding.

```typescript
graph.addEdge(START, 'researchFinancials')
graph.addEdge(START, 'researchNews')
graph.addEdge(START, 'researchCompetitors')
graph.addEdge(START, 'researchRisks')
```

This creates a "fan-out" from START to all 4 research nodes simultaneously. Then you fan back in:

```typescript
graph.addEdge('researchFinancials', 'synthesiseAnalysis')
graph.addEdge('researchNews', 'synthesiseAnalysis')
graph.addEdge('researchCompetitors', 'synthesiseAnalysis')
graph.addEdge('researchRisks', 'synthesiseAnalysis')
```

LangGraph knows that `synthesiseAnalysis` has 4 incoming edges, so it waits for all 4 research nodes to complete before triggering synthesis. This is sometimes called a "join" — the graph implicitly synchronizes at the join point.

The state reducers are what make this safe: since multiple nodes write to the state simultaneously (they each append to `steps`, for instance), the reducer function handles merging. Without a reducer, parallel writes would overwrite each other.

---

## Turn 5 — Streaming to Frontend

**Me:** How do I stream the agent's progress to the frontend in real time?

**Claude:**  
Server-Sent Events (SSE) is the cleanest approach here — it's a browser-native API for unidirectional server→client streaming, and Next.js API routes support it without any extra infrastructure.

The API route returns a `ReadableStream` with `Content-Type: text/event-stream`. Each time the agent calls the `onStep` callback, we write a JSON-encoded SSE message to the stream:

```typescript
function send(data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}
```

On the frontend, you use `fetch()` (not EventSource, because EventSource doesn't support POST) and read the response body as a stream:

```typescript
const reader = res.body.getReader()
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  // parse SSE chunks → update React state
}
```

The agent calls `onStep(step)` between nodes, so the frontend sees each step appear as the agent works — before the final verdict arrives. This makes the UX feel alive and shows the user that work is happening.

---

## Turn 6 — Forcing Structured JSON Output from Gemini

**Me:** How do I make sure Gemini returns valid JSON for the verdict? I've seen LLMs hallucinate markdown backticks or add preamble.

**Claude:**  
Two defenses:

1. **In the prompt**: Put the JSON schema directly in the user message, say "respond with EXACTLY this JSON structure", and use a system message that says "respond with ONLY valid JSON — no markdown, no backticks, no preamble." Being explicit about what NOT to do helps more than just saying "respond in JSON."

2. **In the parsing code**: Strip backticks defensively before parsing:
```typescript
raw = raw.replace(/```json|```/g, '').trim()
```

3. **Fallback**: Wrap `JSON.parse` in a try/catch and return a safe fallback verdict object. Don't let a parsing failure crash the whole agent — surface it gracefully.

Gemini 1.5 Flash is pretty good at following JSON instructions when the schema is explicit. If you were using a smaller/less capable model, you'd want to use function calling / tool use instead, which forces structured output at the API level.

---

## Turn 7 — UI Design Direction

**Me:** What UI aesthetic makes sense for an investment research tool?

**Claude:**  
The subject is financial data + AI reasoning — the natural visual language is a **Bloomberg terminal meets modern SaaS**: dark background, monospace typography, precision data display. Not warm or friendly — sharp and analytical.

Design decisions:
- **Color palette**: Deep navy background (#0a0e17), teal accent (#00d4aa) for buy signals, red (#ff4d6a) for pass/risk, yellow (#ffd166) for neutral/medium
- **Typography**: IBM Plex Mono for all data labels, scores, and identifiers (terminal feel); IBM Plex Sans for body/reasoning text
- **Signature element**: A scanline CSS overlay — a subtle nod to CRT terminals that reinforces the "financial data terminal" theme without being kitschy
- **Score bar**: Animated fill from 0→score on render; colored by threshold (green ≥65, yellow ≥40, red below)
- **Verdict card**: Border and glow color changes based on INVEST/PASS decision — the whole card reads the verdict before you read the text

Restraint: the signature (scanlines) is the single bold choice. Everything else — spacing, layout, type sizes — is disciplined and grid-based.

---

## Turn 8 — README Sections

**Me:** What should I definitely include in the README to impress them?

**Claude:**  
The assignment explicitly asks for these sections: Overview, How to Run, How it Works, Key Decisions & Trade-offs, Example Runs, What You Would Improve.

The sections that differentiate strong submissions:

**Key Decisions & Trade-offs** — Don't just list what you built. Explain *why* you chose LangGraph over a ReAct agent, why SSE over WebSockets, why Gemini over OpenAI. Show you understand the trade space. Also explicitly list what you *left out* and why — this shows product thinking, not just coding ability.

**Example Runs** — Run the agent on 3-4 real companies before submitting. Include one INVEST and one PASS verdict with actual numbers. This proves the agent works and gives reviewers something concrete to evaluate.

**What You Would Improve** — Be specific. "Better UI" is weak. "Integrate Yahoo Finance API to pull structured P/E ratios instead of relying on web search mentions" is strong. List 5-6 concrete improvements with why each would matter.

The bonus transcript requirement is also important — they want to see your thought process. Include this transcript file in your zip.

---

## Turn 9 — Final Review

**Me:** Anything I should double-check before submitting?

**Claude:**  
Checklist before zipping:

- [ ] `.env.local` is in `.gitignore` — your API keys should NOT be in the zip
- [ ] `.env.local.example` IS included with placeholder values
- [ ] README has all 6 required sections
- [ ] README has your actual name filled in at the bottom
- [ ] Agent runs successfully on at least 3 companies (test locally)
- [ ] Example runs in README match actual agent output (run them, copy real output)
- [ ] This transcript file (`AI_CHAT_TRANSCRIPT.md`) is in the zip root
- [ ] Vercel deployment link works (if you deploy — adds bonus points)
- [ ] You can explain every file and every decision if asked in the interview

One thing to be careful about: the assignment says "you must be able to explain everything you submit." In the technical interviews, they will definitely ask about the LangGraph graph structure, why you chose parallel nodes, how SSE streaming works, and how you handle JSON parsing failures. Make sure you've read through `lib/agent.ts` and `app/api/research/route.ts` carefully and can speak to every decision.

---

*End of session transcript*
*Total turns: 9*
*Primary tool: Claude (claude.ai)*
