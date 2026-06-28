import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ── State Definition ─────────────────────────────────────────────────────────
const AgentState = Annotation.Root({
  company: Annotation<string>,
  newsResults: Annotation<string>,
  financialResults: Annotation<string>,
  competitorResults: Annotation<string>,
  riskResults: Annotation<string>,
  analysis: Annotation<string>,
  verdict: Annotation<"INVEST" | "PASS" | "NEUTRAL">,
  confidence: Annotation<number>,
  reasoning: Annotation<string>,
  keyMetrics: Annotation<Record<string, string>>,
  risks: Annotation<string[]>,
  opportunities: Annotation<string[]>,
  steps: Annotation<string[]>,
});

// ── LLM & Tools ──────────────────────────────────────────────────────────────
function getLLM() {
  return new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.3,
  });
}

function getSearchTool() {
  return new TavilySearchResults({
    maxResults: 5,
    apiKey: process.env.TAVILY_API_KEY,
  });
}

// ── Node 1: News & Sentiment Research ────────────────────────────────────────
async function researchNews(state: typeof AgentState.State) {
  const search = getSearchTool();
  const company = state.company;

  const [news, sentiment] = await Promise.all([
    search.invoke(`${company} latest news 2024 2025`),
    search.invoke(`${company} stock market performance investor sentiment`),
  ]);

  return {
    newsResults: `NEWS:\n${news}\n\nMARKET SENTIMENT:\n${sentiment}`,
    steps: [...(state.steps || []), "📰 Researched latest news & market sentiment"],
  };
}

// ── Node 2: Financial Research ────────────────────────────────────────────────
async function researchFinancials(state: typeof AgentState.State) {
  const search = getSearchTool();
  const company = state.company;

  const [financials, growth] = await Promise.all([
    search.invoke(`${company} revenue profit earnings financial results 2024`),
    search.invoke(`${company} growth rate market cap valuation funding`),
  ]);

  return {
    financialResults: `FINANCIALS:\n${financials}\n\nGROWTH & VALUATION:\n${growth}`,
    steps: [...(state.steps || []), "📊 Analyzed financial data & valuation metrics"],
  };
}

// ── Node 3: Competitive & Risk Research ──────────────────────────────────────
async function researchRisks(state: typeof AgentState.State) {
  const search = getSearchTool();
  const company = state.company;

  const [competitors, risks] = await Promise.all([
    search.invoke(`${company} competitors market position competitive advantage`),
    search.invoke(`${company} risks challenges controversies lawsuits regulatory`),
  ]);

  return {
    competitorResults: `COMPETITIVE LANDSCAPE:\n${competitors}`,
    riskResults: `RISKS & CHALLENGES:\n${risks}`,
    steps: [...(state.steps || []), "⚠️ Assessed competitive position & risk factors"],
  };
}

// ── Node 4: Decision Engine ───────────────────────────────────────────────────
async function makeDecision(state: typeof AgentState.State) {
  const llm = getLLM();

  const systemPrompt = `You are an expert investment analyst with 20 years of experience at top-tier hedge funds. 
You analyze companies with a rigorous, data-driven approach. Be specific, cite actual data points from the research, and give a clear verdict.
Always respond in valid JSON.`;

  const userPrompt = `Analyze ${state.company} as an investment opportunity based on this research:

=== NEWS & SENTIMENT ===
${state.newsResults}

=== FINANCIALS ===
${state.financialResults}

=== COMPETITIVE LANDSCAPE ===
${state.competitorResults}

=== RISKS ===
${state.riskResults}

Based on all of the above, provide a comprehensive investment analysis in this exact JSON format:
{
  "verdict": "INVEST" | "PASS" | "NEUTRAL",
  "confidence": <number 0-100>,
  "reasoning": "<3-4 sentence executive summary of your decision>",
  "analysis": "<detailed 300-400 word markdown analysis covering business model, financials, competitive moat, and outlook>",
  "keyMetrics": {
    "Revenue/Valuation": "<value or estimate>",
    "Growth Signal": "<positive/negative/mixed>",
    "Market Position": "<leader/challenger/niche>",
    "Moat Strength": "<wide/narrow/none>",
    "Risk Level": "<low/medium/high>"
  },
  "opportunities": ["<opportunity 1>", "<opportunity 2>", "<opportunity 3>"],
  "risks": ["<risk 1>", "<risk 2>", "<risk 3>"]
}

Be direct. Give a real verdict. Base it strictly on the research provided.`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const text = response.content as string;

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse decision JSON");

  const decision = JSON.parse(jsonMatch[0]);

  return {
    verdict: decision.verdict,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    analysis: decision.analysis,
    keyMetrics: decision.keyMetrics,
    risks: decision.risks,
    opportunities: decision.opportunities,
    steps: [...(state.steps || []), "🧠 Generated investment decision & analysis"],
  };
}

// ── Build the Graph ───────────────────────────────────────────────────────────
function buildGraph() {
  const graph = new StateGraph(AgentState)
    .addNode("researchNews", researchNews)
    .addNode("researchFinancials", researchFinancials)
    .addNode("researchRisks", researchRisks)
    .addNode("makeDecision", makeDecision)
    .addEdge(START, "researchNews")
    .addEdge(START, "researchFinancials")
    .addEdge(START, "researchRisks")
    .addEdge("researchNews", "makeDecision")
    .addEdge("researchFinancials", "makeDecision")
    .addEdge("researchRisks", "makeDecision")
    .addEdge("makeDecision", END);

  return graph.compile();
}

// ── Main Export ───────────────────────────────────────────────────────────────
export async function runInvestmentAgent(company: string) {
  const app = buildGraph();

  const result = await app.invoke({
    company,
    steps: [`🔍 Starting research on ${company}...`],
  });

  return {
    company,
    verdict: result.verdict,
    confidence: result.confidence,
    reasoning: result.reasoning,
    analysis: result.analysis,
    keyMetrics: result.keyMetrics,
    risks: result.risks,
    opportunities: result.opportunities,
    steps: result.steps,
  };
}
