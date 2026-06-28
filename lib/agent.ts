import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { TavilySearch } from '@langchain/tavily'
import { StateGraph, END, START, Annotation } from '@langchain/langgraph'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

// ── State ──────────────────────────────────────────────────────────────────
const AgentState = Annotation.Root({
  company: Annotation<string>(),
  searchResults: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  financialData: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => '' }),
  newsData: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => '' }),
  competitorData: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => '' }),
  riskData: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => '' }),
  analysis: Annotation<string>({ reducer: (x, y) => y ?? x, default: () => '' }),
  verdict: Annotation<VerdictOutput | null>({ reducer: (x, y) => y ?? x, default: () => null }),
  steps: Annotation<AgentStep[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
})

export interface AgentStep {
  node: string
  message: string
  status: 'done' | 'running' | 'error'
}

export interface VerdictOutput {
  company: string
  decision: 'INVEST' | 'PASS'
  score: number          // 0–100
  summary: string
  pros: string[]
  cons: string[]
  metrics: {
    growthOutlook: string
    competitivePosition: string
    financialHealth: string
    riskLevel: string
  }
  disclaimer: string
}

// ── Tools ──────────────────────────────────────────────────────────────────
function getSearchTool() {
  return new TavilySearch({
    maxResults: 4,
  })
}

function getLLM() {
  return new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.3,
  })
}

// ── Nodes ──────────────────────────────────────────────────────────────────

async function researchFinancials(state: typeof AgentState.State) {
  const tool = getSearchTool()
  const query = `${state.company} revenue profit earnings financial results 2024 2025`
  const results = await tool.invoke({ query })
  const text = typeof results === 'string' ? results : JSON.stringify(results)
  return {
    financialData: text,
    steps: [{ node: 'FINANCIALS', message: `Pulled financial data for ${state.company}`, status: 'done' as const }],
  }
}

async function researchNews(state: typeof AgentState.State) {
  const tool = getSearchTool()
  const query = `${state.company} latest news 2025 strategy growth products`
  const results = await tool.invoke({ query })
  const text = typeof results === 'string' ? results : JSON.stringify(results)
  return {
    newsData: text,
    steps: [{ node: 'NEWS', message: `Fetched latest news and strategic updates`, status: 'done' as const }],
  }
}

async function researchCompetitors(state: typeof AgentState.State) {
  const tool = getSearchTool()
  const query = `${state.company} competitors market share industry position`
  const results = await tool.invoke({ query })
  const text = typeof results === 'string' ? results : JSON.stringify(results)
  return {
    competitorData: text,
    steps: [{ node: 'COMPETITIVE', message: `Mapped competitive landscape and market position`, status: 'done' as const }],
  }
}

async function researchRisks(state: typeof AgentState.State) {
  const tool = getSearchTool()
  const query = `${state.company} risks challenges controversy regulatory 2024 2025`
  const results = await tool.invoke({ query })
  const text = typeof results === 'string' ? results : JSON.stringify(results)
  return {
    riskData: text,
    steps: [{ node: 'RISK', message: `Identified key risks and red flags`, status: 'done' as const }],
  }
}

async function synthesiseAnalysis(state: typeof AgentState.State) {
  const llm = getLLM()
  const prompt = `You are a senior equity research analyst. Synthesize the following research on "${state.company}" into a coherent investment thesis.

FINANCIAL DATA:
${state.financialData}

LATEST NEWS:
${state.newsData}

COMPETITIVE LANDSCAPE:
${state.competitorData}

RISKS & CHALLENGES:
${state.riskData}

Write a 3-4 sentence synthesis of the overall investment case. Be specific, factual, and analytical.`

  const response = await llm.invoke([new HumanMessage(prompt)])
  return {
    analysis: response.content as string,
    steps: [{ node: 'SYNTHESIS', message: `Synthesized research into investment thesis`, status: 'done' as const }],
  }
}

async function makeVerdict(state: typeof AgentState.State) {
  const llm = getLLM()

  const system = `You are a hedge fund portfolio manager making final investment decisions. 
You MUST respond with ONLY valid JSON — no markdown, no backticks, no preamble.`

  const prompt = `Based on this research and analysis for "${state.company}", produce a final investment verdict.

SYNTHESIS:
${state.analysis}

FINANCIAL DATA:
${state.financialData}

RISKS:
${state.riskData}

Respond with EXACTLY this JSON structure:
{
  "company": "${state.company}",
  "decision": "INVEST" or "PASS",
  "score": <integer 0-100 representing investment attractiveness>,
  "summary": "<2-3 sentence plain-English verdict explaining the decision>",
  "pros": ["<pro 1>", "<pro 2>", "<pro 3>"],
  "cons": ["<con 1>", "<con 2>", "<con 3>"],
  "metrics": {
    "growthOutlook": "<Strong/Moderate/Weak>",
    "competitivePosition": "<Leader/Challenger/Follower/Niche>",
    "financialHealth": "<Strong/Stable/Stressed/Unknown>",
    "riskLevel": "<Low/Medium/High/Very High>"
  },
  "disclaimer": "This is AI-generated analysis for educational purposes only. Not financial advice."
}`

  const response = await llm.invoke([
    new SystemMessage(system),
    new HumanMessage(prompt),
  ])

  let raw = response.content as string
  raw = raw.replace(/```json|```/g, '').trim()

  let verdict: VerdictOutput
  try {
    verdict = JSON.parse(raw)
  } catch {
    // Fallback if JSON is malformed
    verdict = {
      company: state.company,
      decision: 'PASS',
      score: 50,
      summary: 'Unable to parse structured verdict. Please retry.',
      pros: ['Data retrieved successfully'],
      cons: ['Verdict parsing failed', 'Retry recommended'],
      metrics: {
        growthOutlook: 'Unknown',
        competitivePosition: 'Unknown',
        financialHealth: 'Unknown',
        riskLevel: 'Unknown',
      },
      disclaimer: 'AI-generated analysis for educational purposes only. Not financial advice.',
    }
  }

  return {
    verdict,
    steps: [{ node: 'VERDICT', message: `Decision reached: ${verdict.decision} (Score: ${verdict.score}/100)`, status: 'done' as const }],
  }
}

// ── Graph ──────────────────────────────────────────────────────────────────

function buildGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('researchFinancials', researchFinancials)
    .addNode('researchNews', researchNews)
    .addNode('researchCompetitors', researchCompetitors)
    .addNode('researchRisks', researchRisks)
    .addNode('synthesiseAnalysis', synthesiseAnalysis)
    .addNode('makeVerdict', makeVerdict)
    // Research nodes run in parallel from start
    .addEdge(START, 'researchFinancials')
    .addEdge(START, 'researchNews')
    .addEdge(START, 'researchCompetitors')
    .addEdge(START, 'researchRisks')
    // All research feeds into synthesis
    .addEdge('researchFinancials', 'synthesiseAnalysis')
    .addEdge('researchNews', 'synthesiseAnalysis')
    .addEdge('researchCompetitors', 'synthesiseAnalysis')
    .addEdge('researchRisks', 'synthesiseAnalysis')
    .addEdge('synthesiseAnalysis', 'makeVerdict')
    .addEdge('makeVerdict', END)

  return graph.compile()
}

// ── Public entry ───────────────────────────────────────────────────────────

export async function runInvestmentAgent(
  company: string,
  onStep: (step: AgentStep) => void
): Promise<VerdictOutput> {
  const app = buildGraph()

  onStep({ node: 'INIT', message: `Initializing research agent for "${company}"`, status: 'done' })
  onStep({ node: 'RESEARCH', message: 'Dispatching 4 parallel research tasks...', status: 'running' })

  const stream = await app.stream({
    company,
    searchResults: [],
    financialData: '',
    newsData: '',
    competitorData: '',
    riskData: '',
    analysis: '',
    verdict: null,
    steps: [],
  })

  let finalVerdict: VerdictOutput | null = null

  for await (const chunk of stream) {
    // chunk is a dictionary mapping nodeName -> stateUpdate
    for (const [nodeName, stateUpdate] of Object.entries(chunk as any)) {
      if (stateUpdate && typeof stateUpdate === 'object') {
        const update = stateUpdate as typeof AgentState.State
        if (update.steps) {
          for (const step of update.steps) {
            onStep(step)
          }
        }
        if (update.verdict) {
          finalVerdict = update.verdict
        }
      }
    }
  }

  if (!finalVerdict) throw new Error('Agent did not produce a verdict')
  return finalVerdict
}
