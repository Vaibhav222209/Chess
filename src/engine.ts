export type EngineStatus = 'idle' | 'loading' | 'ready' | 'thinking' | 'error'

export interface EngineEvaluation {
  fen: string
  depth: number
  /** Centipawns from White's perspective. Positive values favor White. */
  scoreCp?: number
  /** Mate distance from White's perspective. Positive values favor White. */
  mate?: number
  pv: string[]
}

export interface EngineMove {
  uci: string
  from: string
  to: string
  promotion?: 'q' | 'r' | 'b' | 'n'
  scoreCp?: number
  mate?: number
}

export interface EngineSearchOptions {
  skillLevel?: number
  elo?: number
  moveTimeMs?: number
}

export interface EngineCallbacks {
  onStatus?: (status: EngineStatus) => void
  onEvaluation?: (evaluation: EngineEvaluation) => void
  onError?: (error: Error) => void
}

interface Search {
  fen: string
  resolve: (move: EngineMove) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
  evaluation?: EngineEvaluation
}

function cancelled(): DOMException {
  return new DOMException('Engine search cancelled', 'AbortError')
}

function clampOption(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value! : fallback)))
}

/** A single-threaded Stockfish worker; no cross-origin isolation is required. */
export class ChessEngine {
  private worker: Worker | null = null
  private initialization: Promise<void> | null = null
  private resolveInitialization: (() => void) | null = null
  private rejectInitialization: ((error: Error) => void) | null = null
  private initializationTimeout: ReturnType<typeof setTimeout> | null = null
  private search: Search | null = null
  private generation = 0
  private disposed = false
  private currentStatus: EngineStatus = 'idle'

  constructor(private readonly callbacks: EngineCallbacks = {}) {}

  get status(): EngineStatus {
    return this.currentStatus
  }

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('This chess engine has been destroyed'))
    if (this.initialization) return this.initialization

    this.setStatus('loading')
    this.initialization = new Promise<void>((resolve, reject) => {
      this.resolveInitialization = resolve
      this.rejectInitialization = reject
    })
    // Keep a local reference: a synchronous worker-construction failure clears state.
    const initialization = this.initialization
    try {
      const worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-17.1-lite-single.js`)
      this.worker = worker
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (this.worker !== worker || typeof event.data !== 'string') return
        for (const line of event.data.split(/\r?\n/)) this.handleLine(line.trim())
      }
      worker.onerror = (event) => {
        if (this.worker !== worker) return
        event.preventDefault()
        this.fail(new Error(event.message || 'Stockfish could not load. Please retry.'))
      }
      worker.onmessageerror = () => {
        if (this.worker === worker) this.fail(new Error('Stockfish returned an unreadable response'))
      }
      this.initializationTimeout = setTimeout(() => {
        this.fail(new Error('Stockfish took too long to load. Check the engine assets and retry.'))
      }, 30_000)
      worker.postMessage('uci')
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error('Web Workers are unavailable'))
    }
    return initialization
  }

  async bestMove(fen: string, options: EngineSearchOptions = {}): Promise<EngineMove> {
    if (this.search) this.stop()
    const generation = ++this.generation
    await this.init()
    if (generation !== this.generation || this.disposed) throw cancelled()

    // These values are UCI command arguments, so accept only a structurally valid FEN.
    if (!/^[prnbqkPRNBQK1-8/]+ [wb] [-KQkq]+ (?:-|[a-h][36]) \d+ \d+$/.test(fen)) {
      throw new Error('A valid FEN position is required for engine analysis')
    }
    const skillLevel = clampOption(options.skillLevel, 10, 0, 20)
    const moveTimeMs = clampOption(options.moveTimeMs, 1000, 100, 30_000)
    const elo = options.elo === undefined ? undefined : clampOption(options.elo, 1500, 1320, 3190)

    return new Promise<EngineMove>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.fail(new Error('Stockfish search timed out. Please retry.'))
      }, moveTimeMs + 15_000)
      this.search = { fen, resolve, reject, timeout }
      this.setStatus('thinking')
      this.send(`setoption name Skill Level value ${skillLevel}`)
      this.send(`setoption name UCI_LimitStrength value ${elo !== undefined}`)
      if (elo !== undefined) this.send(`setoption name UCI_Elo value ${elo}`)
      this.send(`position fen ${fen}`)
      this.send(`go movetime ${moveTimeMs}`)
    })
  }

  /** Cancels searches and initialization. A fresh worker is created on the next request. */
  stop(): void {
    ++this.generation
    this.release(cancelled())
    if (!this.disposed) this.setStatus('idle')
  }

  destroy(): void {
    this.disposed = true
    this.stop()
  }

  private send(command: string): void {
    this.worker?.postMessage(command)
  }

  private setStatus(status: EngineStatus): void {
    this.currentStatus = status
    this.callbacks.onStatus?.(status)
  }

  private handleLine(line: string): void {
    if (line === 'uciok') {
      this.send('setoption name Hash value 32')
      this.send('setoption name MultiPV value 1')
      this.send('isready')
      return
    }
    if (line === 'readyok' && this.resolveInitialization) {
      if (this.initializationTimeout) clearTimeout(this.initializationTimeout)
      this.initializationTimeout = null
      const resolve = this.resolveInitialization
      this.resolveInitialization = null
      this.rejectInitialization = null
      this.setStatus('ready')
      resolve()
      return
    }

    const search = this.search
    if (!search) return
    if (line.startsWith('info ')) {
      const score = line.match(/\bscore (cp|mate) (-?\d+)/)
      const depth = line.match(/\bdepth (\d+)/)
      // Bound scores are provisional; retain the last exact evaluation.
      if (score && depth && !/\b(?:lowerbound|upperbound)\b/.test(line)) {
        const sign = search.fen.split(' ')[1] === 'w' ? 1 : -1
        const value = Number(score[2]) * sign
        const evaluation: EngineEvaluation = {
          fen: search.fen,
          depth: Number(depth[1]),
          ...(score[1] === 'cp' ? { scoreCp: value } : { mate: value }),
          pv: line.match(/\bpv (.+)$/)?.[1].split(' ') ?? [],
        }
        search.evaluation = evaluation
        this.callbacks.onEvaluation?.(evaluation)
      }
      return
    }
    if (line.startsWith('bestmove ')) {
      const uci = line.split(/\s+/)[1]
      const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci)
      clearTimeout(search.timeout)
      this.search = null
      this.setStatus('ready')
      if (!match) {
        search.reject(new Error('No legal move is available in this position'))
        return
      }
      search.resolve({
        uci,
        from: match[1],
        to: match[2],
        ...(match[3] ? { promotion: match[3] as EngineMove['promotion'] } : {}),
        ...(search.evaluation?.scoreCp !== undefined ? { scoreCp: search.evaluation.scoreCp } : {}),
        ...(search.evaluation?.mate !== undefined ? { mate: search.evaluation.mate } : {}),
      })
    }
  }

  private release(error: Error): void {
    if (this.initializationTimeout) clearTimeout(this.initializationTimeout)
    this.initializationTimeout = null
    this.worker?.terminate()
    this.worker = null
    if (this.search) {
      clearTimeout(this.search.timeout)
      this.search.reject(error)
      this.search = null
    }
    this.rejectInitialization?.(error)
    this.resolveInitialization = null
    this.rejectInitialization = null
    this.initialization = null
  }

  private fail(error: Error): void {
    ++this.generation
    this.release(error)
    this.setStatus('error')
    this.callbacks.onError?.(error)
  }
}
