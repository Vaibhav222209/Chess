import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChessEngine, type EngineEvaluation } from './engine'

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const blackFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

class MockWorker {
  static instances: MockWorker[] = []
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  messages: string[] = []
  terminated = false

  constructor() {
    MockWorker.instances.push(this)
  }

  postMessage(command: string) {
    this.messages.push(command)
    if (command === 'uci') queueMicrotask(() => this.emit('uciok'))
    if (command === 'isready') queueMicrotask(() => this.emit('readyok'))
  }

  emit(line: string) {
    this.onmessage?.({ data: line } as MessageEvent<string>)
  }

  terminate() {
    this.terminated = true
  }
}

describe('ChessEngine worker lifecycle', () => {
  const engines: ChessEngine[] = []
  const createEngine = (callbacks: ConstructorParameters<typeof ChessEngine>[0] = {}) => {
    const engine = new ChessEngine(callbacks)
    engines.push(engine)
    return engine
  }

  beforeEach(() => {
    MockWorker.instances = []
    vi.stubGlobal('Worker', MockWorker)
  })

  afterEach(() => {
    engines.splice(0).forEach((engine) => engine.destroy())
    vi.unstubAllGlobals()
  })

  it('completes the UCI handshake and returns legal-shaped promotion moves', async () => {
    const engine = createEngine()
    await engine.init()
    expect(engine.status).toBe('ready')
    const move = engine.bestMove(initialFen, { skillLevel: 7, moveTimeMs: 500 })
    await Promise.resolve()
    const worker = MockWorker.instances[0]
    expect(worker.messages).toContain('setoption name Skill Level value 7')
    expect(worker.messages).toContain('go movetime 500')
    worker.emit('bestmove a7a8n ponder e8d7')
    await expect(move).resolves.toMatchObject({ uci: 'a7a8n', from: 'a7', to: 'a8', promotion: 'n' })
    expect(engine.status).toBe('ready')
  })

  it('normalizes centipawn and mate evaluations to White’s perspective', async () => {
    const evaluations: EngineEvaluation[] = []
    const engine = createEngine({ onEvaluation: (evaluation) => evaluations.push(evaluation) })
    await engine.init()
    const move = engine.bestMove(blackFen)
    await Promise.resolve()
    const worker = MockWorker.instances[0]
    worker.emit('info depth 12 score cp 85 nodes 100 pv e7e5 g1f3')
    expect(evaluations[0]).toMatchObject({ fen: blackFen, depth: 12, scoreCp: -85, pv: ['e7e5', 'g1f3'] })
    worker.emit('info depth 13 score mate -3 pv e7e5')
    worker.emit('bestmove e7e5')
    await expect(move).resolves.toMatchObject({ mate: 3 })
  })

  it('rejects a superseded search and ignores bestmoves from its old worker', async () => {
    const engine = createEngine()
    await engine.init()
    const first = engine.bestMove(initialFen)
    const firstResult = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    const oldWorker = MockWorker.instances[0]
    const second = engine.bestMove(blackFen)
    // The second request must complete its own initialization, not reuse the old worker.
    await engine.init()
    await Promise.resolve()
    expect(oldWorker.terminated).toBe(true)
    oldWorker.emit('bestmove e2e4')
    const worker = MockWorker.instances[1]
    worker.emit('bestmove e7e5')
    await firstResult
    await expect(second).resolves.toMatchObject({ uci: 'e7e5' })
  })

  it('surfaces worker errors and can load a new worker on retry', async () => {
    const onError = vi.fn()
    const engine = createEngine({ onError })
    await engine.init()
    const move = engine.bestMove(initialFen)
    const failed = expect(move).rejects.toThrow('WASM failed')
    await Promise.resolve()
    MockWorker.instances[0].onerror?.({ message: 'WASM failed', preventDefault() {} } as ErrorEvent)
    await failed
    expect(onError).toHaveBeenCalledOnce()
    expect(engine.status).toBe('error')
    await engine.init()
    expect(MockWorker.instances).toHaveLength(2)
    expect(engine.status).toBe('ready')
  })
})
