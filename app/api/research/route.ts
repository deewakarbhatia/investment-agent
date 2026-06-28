import { NextRequest } from 'next/server'
import { runInvestmentAgent } from '@/lib/agent'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const { company } = await req.json()

  if (!company || typeof company !== 'string' || company.trim().length < 2) {
    return new Response(JSON.stringify({ error: 'Invalid company name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Server-Sent Events stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const verdict = await runInvestmentAgent(company.trim(), (step) => {
          send({ type: 'step', step })
        })
        send({ type: 'verdict', verdict })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        send({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
