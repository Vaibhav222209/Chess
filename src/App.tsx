import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Square, type PieceSymbol } from 'chess.js';
import { Activity, ArrowDownUp, ArrowRight, BookOpen, Check, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Copy, Cpu, Download, Flag, Lightbulb, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Swords, Upload, Users, Volume2, VolumeX, X } from 'lucide-react';
import ChessBoard from './components/ChessBoard';
import { Piece } from './components/Piece';
import { ChessEngine, type EngineEvaluation } from './engine';
import { copyGame, DEFAULT_CONFIG, formatClock, gameResult, historyRows, lineToSan, positionsOf, timeoutResult, type GameConfig, type GameResult } from './game';

type Modal = 'new' | 'import' | 'help' | 'resign' | null;
type Snapshot = { pgn: string; config: GameConfig; playerColor: Color; clocks: Record<Color, number>; result: GameResult | null; started: boolean };
const SAVE_KEY = 'thakur-chess-club:v1';
const TIME_CONTROLS = [{ minutes: 3, increment: 2, name: 'Blitz' }, { minutes: 5, increment: 0, name: 'Blitz' }, { minutes: 10, increment: 5, name: 'Rapid' }, { minutes: 15, increment: 10, name: 'Rapid' }, { minutes: 30, increment: 0, name: 'Classical' }, { minutes: 0, increment: 0, name: 'Unlimited' }];

function restore(): Snapshot | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Snapshot | null;
    if (!raw || typeof raw.pgn !== 'string' || !raw.config || !['computer', 'local'].includes(raw.config.mode) || !['w', 'b'].includes(raw.playerColor) || !raw.clocks || !Number.isFinite(raw.clocks.w) || !Number.isFinite(raw.clocks.b)) return null;
    const test = new Chess(); test.loadPgn(raw.pgn);
    return raw;
  } catch { return null; }
}

function App() {
  const [saved] = useState(restore);
  const [game, setGame] = useState(() => { const chess = new Chess(); if (saved) chess.loadPgn(saved.pgn); return chess; });
  const [config, setConfig] = useState<GameConfig>(saved?.config ?? DEFAULT_CONFIG);
  const [draft, setDraft] = useState<GameConfig>(saved?.config ?? DEFAULT_CONFIG);
  const [playerColor, setPlayerColor] = useState<Color>(saved?.playerColor ?? 'w');
  const [orientation, setOrientation] = useState<Color>(saved?.playerColor ?? 'w');
  const [clocks, setClocks] = useState<Record<Color, number>>(saved?.clocks ?? { w: 600000, b: 600000 });
  const clocksRef = useRef(clocks); clocksRef.current = clocks;
  const [started, setStarted] = useState(saved?.started ?? false);
  const [paused, setPaused] = useState(!!saved?.started && !saved?.result);
  const [result, setResult] = useState<GameResult | null>(saved?.result ?? null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [previewPly, setPreviewPly] = useState<number | null>(null);
  const [engineStatus, setEngineStatus] = useState('loading');
  const [evaluation, setEvaluation] = useState<EngineEvaluation | null>(null);
  const [engineError, setEngineError] = useState('');
  const [tab, setTab] = useState<'moves' | 'analysis'>('moves');
  const [modal, setModal] = useState<Modal>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importType, setImportType] = useState<'pgn' | 'fen'>('pgn');
  const [sound, setSound] = useState(false);
  const [toast, setToast] = useState('');
  const [hint, setHint] = useState<{ from: Square; to: Square; fen: string } | null>(null);
  const engineRef = useRef<ChessEngine | null>(null);
  const analysisRef = useRef(false);
  const generation = useRef(0);
  const timerRef = useRef(performance.now());
  const historyEnd = useRef<HTMLDivElement>(null);
  const fen = game.fen();
  const moves = game.history({ verbose: true });
  const positions = useMemo(() => positionsOf(game), [game]);
  const rows = useMemo(() => historyRows(game), [game]);
  const shownPly = previewPly === null ? moves.length : Math.min(previewPly, moves.length);
  const shownFen = positions[shownPly];
  const reviewing = previewPly !== null && previewPly < moves.length;
  const shownGame = useMemo(() => new Chess(shownFen), [shownFen]);
  const thinking = engineStatus === 'thinking';
  const computerTurn = config.mode === 'computer' && game.turn() !== playerColor;
  const finished = result ?? gameResult(game);
  const turnLabel = game.turn() === 'w' ? 'White' : 'Black';
  const legalTargets = useMemo(() => selected ? shownGame.moves({ square: selected, verbose: true }).map(m => m.to) : [], [shownGame, selected]);
  const checkSquare = shownGame.isCheck() ? shownGame.board().flat().find(p => p?.type === 'k' && p.color === shownGame.turn())?.square ?? null : null;
  const visibleLastMove = shownPly > 0 ? moves[shownPly - 1] : null;

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    const engine = new ChessEngine({ onStatus: setEngineStatus, onEvaluation: setEvaluation, onError: error => setEngineError(String(error)) });
    engineRef.current = engine;
    engine.init().catch(error => { if (error.name !== 'AbortError') setEngineError('The engine could not load. Local two-player chess is still available.'); });
    return () => { engine.destroy(); engineRef.current = null; };
  }, []);
  useEffect(() => { const container = historyEnd.current?.parentElement; if (container) container.scrollTop = container.scrollHeight; }, [moves.length, tab]);
  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ pgn: game.pgn(), config, playerColor, clocks, result: finished, started } satisfies Snapshot)); } catch { /* Storage can be disabled; the game still works. */ }
  }, [game, config, playerColor, clocks, finished, started]);

  const playSound = useCallback((capture = false) => {
    if (!sound) return;
    try {
      const context = new AudioContext();
      const osc = context.createOscillator(); const gain = context.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(capture ? 320 : 520, context.currentTime);
      gain.gain.setValueAtTime(0.08, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
      osc.connect(gain); gain.connect(context.destination); osc.start(); osc.stop(context.currentTime + 0.13);
      osc.onended = () => { void context.close(); };
    } catch { /* Audio is optional. */ }
  }, [sound]);

  const commitMove = useCallback((from: string, to: string, promote: string = 'q') => {
    if (finished || paused) return;
    const next = copyGame(game);
    try {
      const move = next.move({ from, to, promotion: promote });
      const now = performance.now();
      const elapsed = started && config.minutes > 0 ? Math.max(0, now - timerRef.current) : 0;
      const remaining = clocksRef.current[game.turn()] - elapsed;
      if (config.minutes > 0 && started && remaining <= 0) { setResult(timeoutResult(game, game.turn())); return; }
      setClocks(previous => ({ ...previous, [game.turn()]: config.minutes > 0 ? Math.max(0, remaining) + config.increment * 1000 : previous[game.turn()] }));
      timerRef.current = now;
      setGame(next); setStarted(true); setSelected(null); setPromotion(null); setHint(null); setPreviewPly(null);
      const outcome = gameResult(next); if (outcome) setResult(outcome);
      playSound(!!move.captured);
    } catch { notify('That move is not legal in this position.'); }
  }, [game, finished, paused, started, config, playSound, notify]);

  useEffect(() => {
    timerRef.current = performance.now();
    if (!started || paused || finished || config.minutes === 0) return;
    const id = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - timerRef.current; timerRef.current = now;
      const remaining = Math.max(0, clocksRef.current[game.turn()] - elapsed);
      const next = { ...clocksRef.current, [game.turn()]: remaining };
      clocksRef.current = next; setClocks(next);
      if (remaining <= 0) { engineRef.current?.stop(); setResult(timeoutResult(game, game.turn())); }
    }, 100);
    return () => clearInterval(id);
  }, [fen, started, paused, finished, config.minutes, game]);

  useEffect(() => {
    if (!computerTurn || finished || paused || engineError || !engineRef.current) return;
    const engine = engineRef.current;
    const thisGeneration = ++generation.current;
    let disposed = false;
    // Let the board settle before starting a fresh worker after a cancellation.
    const id = window.setTimeout(() => {
      analysisRef.current = false;
      engine.bestMove(fen, { skillLevel: config.skill, moveTimeMs: 350 + config.skill * 60 }).then(move => {
        if (!disposed && thisGeneration === generation.current) commitMove(move.from, move.to, move.promotion);
      }).catch(error => { if (!disposed && error.name !== 'AbortError') setEngineError('The engine stopped unexpectedly. Retry it below or start a local game.'); });
    }, 180);
    return () => { disposed = true; clearTimeout(id); engine.stop(); };
  }, [fen, computerTurn, finished, paused, engineError, config.skill, commitMove]);

  const clickSquare = (square: Square) => {
    if (finished || paused || reviewing || computerTurn || thinking || promotion) return;
    const piece = game.get(square);
    if (selected && legalTargets.includes(square)) {
      const candidates = game.moves({ square: selected, verbose: true }).filter(m => m.to === square);
      if (candidates.some(m => m.isPromotion())) { setPromotion({ from: selected, to: square }); return; }
      commitMove(selected, square);
    } else setSelected(piece?.color === game.turn() ? (selected === square ? null : square) : null);
  };

  const startGame = (settings = draft) => {
    generation.current++; engineRef.current?.stop();
    const color = settings.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.color;
    const next = new Chess();
    next.header('Event', 'Thakur Chess Club', 'White', settings.mode === 'computer' && color === 'b' ? 'Stockfish 17.1' : 'Vaibhav’s Club · White', 'Black', settings.mode === 'computer' && color === 'w' ? 'Stockfish 17.1' : 'Vaibhav’s Club · Black');
    setGame(next); setConfig({ ...settings }); setDraft({ ...settings }); setPlayerColor(color); setOrientation(color);
    const initial = settings.minutes * 60000;
    clocksRef.current = { w: initial, b: initial }; setClocks({ w: initial, b: initial });
    timerRef.current = performance.now(); setStarted(false); setPaused(false); setResult(null); setSelected(null); setPromotion(null); setPreviewPly(null); setEvaluation(null); setHint(null); setModal(null); setTab('moves');
    notify(settings.mode === 'computer' ? 'A new challenge. Your move.' : 'Local two-player game started. White moves first.');
  };

  const newGame = () => { if (started && !finished) setModal('new'); else startGame(); };
  const takeBack = () => {
    if (!moves.length || finished || reviewing) { notify(finished ? 'Start a new game to play again.' : 'There is no move to take back.'); return; }
    generation.current++; engineRef.current?.stop();
    const next = copyGame(game); next.undo();
    if (config.mode === 'computer' && next.turn() !== playerColor && next.history().length) next.undo();
    setGame(next); setSelected(null); setHint(null); setEvaluation(null); setPromotion(null);
    timerRef.current = performance.now(); notify('Move taken back. The clocks keep their current time.');
  };

  const requestAnalysis = async (asHint = false) => {
    if (!engineRef.current || thinking || computerTurn && !finished && !reviewing) { notify('Let Stockfish finish its current move first.'); return; }
    setTab('analysis'); analysisRef.current = true;
    const requestFen = shownFen; const token = generation.current;
    try {
      const best = await engineRef.current.bestMove(requestFen, { skillLevel: 20, moveTimeMs: 1500 });
      if (token !== generation.current) return;
      const notation = new Chess(requestFen).move({ from: best.from, to: best.to, promotion: best.promotion ?? 'q' }).san;
      if (asHint && requestFen === game.fen() && !finished && !reviewing) { setHint({ from: best.from as Square, to: best.to as Square, fen: requestFen }); setSelected(best.from as Square); }
      notify(`${asHint ? 'Hint' : 'Best move'}: ${notation}`);
    } catch (error) { if ((error as Error).name !== 'AbortError') notify('Analysis is unavailable. Please retry the engine.'); }
    finally { analysisRef.current = false; }
  };

  const importPosition = () => {
    try {
      const next = new Chess();
      if (!importText.trim()) throw new Error('Paste a position or game first.');
      if (importType === 'fen') next.load(importText.trim()); else next.loadPgn(importText.trim());
      next.header('Result', '*');
      generation.current++; engineRef.current?.stop();
      setGame(next); setConfig(c => ({ ...c, mode: 'local', minutes: 0, increment: 0 })); setDraft(c => ({ ...c, mode: 'local', minutes: 0, increment: 0 }));
      setResult(gameResult(next)); setStarted(false); setPaused(false); setSelected(null); setPreviewPly(null); setPromotion(null); setEvaluation(null); setHint(null); setModal(null); setImportError('');
      notify('Imported into an untimed, local analysis board.');
    } catch (error) { setImportError((error as Error).message || 'This position could not be imported.'); }
  };

  const exportPgn = () => {
    const next = copyGame(game);
    if (finished) next.header('Result', finished.result);
    const blob = new Blob([next.pgn()], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'thakur-chess-game.pgn'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Your game has been exported as PGN.');
  };
  const copyFen = async () => {
    try { await navigator.clipboard.writeText(shownFen); notify('FEN copied to clipboard.'); }
    catch { setImportType('fen'); setImportText(shownFen); setImportError('Clipboard unavailable. Select and copy the FEN below.'); setModal('import'); }
  };

  const goTo = (ply: number) => { setPreviewPly(ply >= moves.length ? null : Math.max(0, ply)); setSelected(null); setHint(null); };
  const evalCurrent = evaluation && evaluation.fen === shownFen ? evaluation : null;
  const score = evalCurrent?.mate !== undefined ? `${evalCurrent.mate > 0 ? '+' : '−'}M${Math.abs(evalCurrent.mate)}` : evalCurrent?.scoreCp !== undefined ? `${evalCurrent.scoreCp >= 0 ? '+' : '−'}${(Math.abs(evalCurrent.scoreCp) / 100).toFixed(1)}` : '—';
  const whitePercent = evalCurrent?.mate !== undefined ? (evalCurrent.mate > 0 ? 98 : 2) : evalCurrent?.scoreCp !== undefined ? Math.min(96, Math.max(4, 50 + evalCurrent.scoreCp / 20)) : 50;
  const pv = evalCurrent ? lineToSan(evalCurrent.fen, evalCurrent.pv ?? []) : [];
  const whiteName = config.mode === 'computer' && playerColor === 'b' ? 'Stockfish 17.1' : config.mode === 'local' ? 'White pieces' : 'You';
  const blackName = config.mode === 'computer' && playerColor === 'w' ? 'Stockfish 17.1' : config.mode === 'local' ? 'Black pieces' : 'You';
  const opening = moves.length === 0 ? 'The opening is yours' : moves[0]?.san === 'e4' ? moves[1]?.san === 'e5' ? 'Open game · 1. e4 e5' : moves[1]?.san === 'c5' ? 'Sicilian Defense' : 'King’s Pawn Opening' : moves[0]?.san === 'd4' ? 'Queen’s Pawn Opening' : moves[0]?.san === 'Nf3' ? 'Réti Opening' : 'Opening exploration';

  const playerRow = (color: Color) => {
    const isComputer = config.mode === 'computer' && color !== playerColor;
    const active = game.turn() === color && !finished && !paused && started;
    return <div className={`player-row ${active ? 'player-active' : ''}`}>
      <div className={`player-avatar ${isComputer ? 'computer-avatar' : ''}`}>{isComputer ? <Cpu size={21} /> : <span>{config.mode === 'local' ? color === 'w' ? 'W' : 'B' : 'VT'}</span>}</div>
      <div className="player-info"><div className="player-name">{color === 'w' ? whiteName : blackName}<span className={`piece-color color-${color}`} /></div><div className="player-detail">{isComputer ? `Engine · Level ${config.skill}` : config.mode === 'local' ? 'Local two-player' : 'The challenger'}{isComputer && thinking && <span className="thinking-dots"> · thinking</span>}</div></div>
      <div className={`clock ${active ? 'clock-active' : ''} ${config.minutes > 0 && clocks[color] < 30000 ? 'clock-low' : ''}`} aria-label={`${color === 'w' ? 'White' : 'Black'} clock`}><span className="clock-dot" />{config.minutes === 0 ? '∞' : formatClock(clocks[color])}</div>
    </div>;
  };

  const settings = (prefix: string) => <>
    <div className="segmented" aria-label="Opponent"><button className={`segment ${draft.mode === 'computer' ? 'active' : ''}`} onClick={() => setDraft(d => ({ ...d, mode: 'computer' }))}><Cpu size={16} /> Computer</button><button className={`segment ${draft.mode === 'local' ? 'active' : ''}`} onClick={() => setDraft(d => ({ ...d, mode: 'local' }))}><Users size={16} /> A friend</button></div>
    <div className="setting-row"><span className="field-label">TIME CONTROL</span><span className="tiny-label">{draft.minutes === 0 ? 'No clock' : `${draft.increment}s increment`}</span></div>
    <div className="option-grid">{TIME_CONTROLS.map(time => <button key={`${time.minutes}+${time.increment}`} className={`option ${draft.minutes === time.minutes && draft.increment === time.increment ? 'selected' : ''}`} onClick={() => setDraft(d => ({ ...d, minutes: time.minutes, increment: time.increment }))}><span className="option-title">{time.minutes === 0 ? '∞' : `${time.minutes} + ${time.increment}`}</span><span className="option-detail">{time.name}</span></button>)}</div>
    {draft.mode === 'computer' && <><div className="setting-row"><span className="field-label">PLAY AS</span><div className="color-options"><button className={`color-option ${draft.color === 'w' ? 'selected' : ''}`} aria-label="Play as white" onClick={() => setDraft(d => ({ ...d, color: 'w' }))}><span className="color-disc white" /></button><button className={`color-option ${draft.color === 'random' ? 'selected' : ''}`} aria-label="Random color" onClick={() => setDraft(d => ({ ...d, color: 'random' }))}><span className="color-disc random" /></button><button className={`color-option ${draft.color === 'b' ? 'selected' : ''}`} aria-label="Play as black" onClick={() => setDraft(d => ({ ...d, color: 'b' }))}><span className="color-disc black" /></button></div></div><div className="difficulty-row"><div className="setting-row"><label htmlFor={`${prefix}strength`} className="field-label">ENGINE STRENGTH</label><span className="strength-label">{draft.skill < 5 ? 'Casual' : draft.skill < 11 ? 'Club' : draft.skill < 17 ? 'Expert' : 'Master'} <span>· {draft.skill}/20</span></span></div><input id={`${prefix}strength`} type="range" min="0" max="20" value={draft.skill} onChange={e => setDraft(d => ({ ...d, skill: Number(e.target.value) }))} style={{ '--range-progress': `${draft.skill * 5}%` } as React.CSSProperties} /></div></>}
  </>;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="./" onClick={event => event.preventDefault()} aria-label="Thakur Chess Club home"><span className="brand-icon"><Piece type="n" color="b" /></span><span><span className="brand-name">THAKUR</span><span className="brand-subtitle">CHESS CLUB</span></span></a><nav aria-label="Main navigation"><button className={`nav-link ${tab === 'moves' ? 'active' : ''}`} onClick={() => setTab('moves')}>Play<span className="nav-dot" /></button><button className={`nav-link ${tab === 'analysis' ? 'active' : ''}`} onClick={() => { setTab('analysis'); }}>Analysis</button><button className="nav-link" onClick={() => setModal('help')}>How to play <BookOpen size={13} /></button></nav><div className={`engine-badge ${engineError ? 'engine-offline' : ''}`}><span className="live-dot" />{engineError ? 'ENGINE OFFLINE' : engineStatus === 'loading' ? 'LOADING ENGINE' : 'STOCKFISH 17.1'}<span className="engine-local">ON DEVICE</span></div></header>
    <main><section className="hero"><div className="hero-copy"><div className="eyebrow"><span /> THE THINKING PERSON’S PLAYGROUND</div><h1>A beautiful game.<br /><em>A sharper mind.</em></h1></div><div className="hero-aside"><div className="hero-tag"><Sparkles size={15} /> YOUR NEXT GREAT MOVE STARTS HERE</div><p>Find your focus. Trust your instinct.<br />Make every move mean something.</p><div className="hero-rule" /><span className="hero-note">Crafted by <strong>Vaibhav Thakur</strong></span></div></section>
    <section className="workspace" aria-label="Chess workspace"><div className="game-column"><div className="board-topline"><span className="section-label"><Swords size={15} /> {config.mode === 'computer' ? 'PLAY THE COMPUTER' : 'OVER THE BOARD'}</span><span className="board-game-type">{config.minutes === 0 ? 'Unlimited' : `${config.minutes} + ${config.increment}`}<span>•</span>Unrated practice</span></div>
      {playerRow(orientation === 'w' ? 'b' : 'w')}
      <div className="board-layout"><div className="eval-bar" aria-label={`White evaluation ${score}`}><div className="eval-fill" style={{ height: `${orientation === 'w' ? whitePercent : 100 - whitePercent}%`, background: orientation === 'w' ? '#e9e9dc' : '#343e3d' }} /><span className="eval-number">{score}</span></div><ChessBoard fen={shownFen} orientation={orientation} selected={selected} legalTargets={legalTargets} lastMove={visibleLastMove ? { from: visibleLastMove.from, to: visibleLastMove.to } : null} checkSquare={checkSquare} disabled={!!finished || paused || reviewing || computerTurn || thinking} onSquareClick={clickSquare} /></div>
      {playerRow(orientation)}
      <div className="board-footer"><div className="game-status" aria-live="polite"><span className={`status-dot ${finished ? 'finished' : ''}`} />{reviewing ? `Reviewing ${shownPly ? `move ${moves[shownPly - 1].before.split(' ')[5]}` : 'starting position'}` : finished ? finished.title : paused ? 'Game paused · welcome back' : thinking ? analysisRef.current ? 'Analyzing position…' : 'Stockfish is thinking…' : shownGame.isCheck() ? `${turnLabel} is in check` : !started ? `${turnLabel} to move. Make it count.` : `${turnLabel} to move`}</div><div className="board-actions"><button className="icon-button" title="Flip board" aria-label="Flip board" onClick={() => setOrientation(o => o === 'w' ? 'b' : 'w')}><ArrowDownUp size={17} /></button><button className="icon-button" title={sound ? 'Mute move sounds' : 'Enable move sounds'} aria-label={sound ? 'Mute move sounds' : 'Enable move sounds'} onClick={() => setSound(s => !s)}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button className="icon-button" title="How to play" aria-label="How to play" onClick={() => setModal('help')}><BookOpen size={17} /></button></div></div>
      {reviewing && <div className="status-banner"><span>You’re reviewing an earlier position. {started && !finished && !paused && config.minutes > 0 ? 'Your clock is still running.' : ''}</span><button className="text-button" onClick={() => goTo(moves.length)}>Back to live game <ArrowRight size={14} /></button></div>}
      {paused && !finished && <div className="status-banner"><span>Your game was saved on this device.</span><button className="text-button" onClick={() => { timerRef.current = performance.now(); setPaused(false); }}>Resume game <ArrowRight size={14} /></button></div>}
      {finished && <div className="result-banner"><div><span className="eyebrow">{finished.result}</span><h3>{finished.title}</h3><p>{finished.detail}</p></div><button className="secondary-button" onClick={() => startGame(config)}>Play again <ArrowRight size={15} /></button></div>}
      {hint?.fen === fen && <div className="status-banner"><Lightbulb size={16} /><span>Consider {hint.from} → {hint.to}. The highlighted piece is ready.</span></div>}
      {engineError && <div className="error-banner"><span>{engineError}</span><button className="text-button" onClick={() => { setEngineError(''); engineRef.current?.init().catch(() => setEngineError('The engine could not load. Check the engine assets and retry.')); }}>Retry engine</button></div>}
      <div className="underboard-note"><ShieldCheck size={14} /><span>Full chess rules. Private by design. No account needed.</span></div>
    </div>
    <aside className="side-column"><section className="card new-game-card"><div className="card-header"><div className="card-title"><span className="mini-icon"><Swords size={17} /></span><h2>Your next challenge</h2></div><span className="card-index">01</span></div>{settings('card-')}<button className="primary-button" onClick={newGame}>Start a new game <ArrowRight size={18} /></button><div className="card-footnote"><ShieldCheck size={12} /> Play freely. Improve every day.</div></section>
    <section className="card moves-card"><div className="card-header moves-tabs"><div role="tablist" aria-label="Game information"><button role="tab" aria-selected={tab === 'moves'} className={`tab ${tab === 'moves' ? 'active' : ''}`} onClick={() => setTab('moves')}>Moves <span>{moves.length}</span></button><button role="tab" aria-selected={tab === 'analysis'} className={`tab ${tab === 'analysis' ? 'active' : ''}`} onClick={() => setTab('analysis')}>Analysis</button></div><Activity size={15} /></div>
      {tab === 'moves' ? <><div className="opening-label"><BookOpen size={12} />{opening}</div><div className="move-history" role="tabpanel" aria-label="Move history">{moves.length === 0 ? <div className="empty-history"><span className="empty-board-mark">♟</span><p>A clean board. Endless possibilities.</p><span>Your moves will appear here.</span></div> : rows.map(row => <div className="move-row" key={row.number}><span className="move-number">{row.number}.</span>{([row.white, row.black] as const).map((ply, column) => ply !== undefined ? <button key={column} className={`move-san ${shownPly === ply + 1 ? 'current' : ''}`} onClick={() => goTo(ply + 1)} aria-label={`Move ${row.number}, ${moves[ply].color === 'w' ? 'white' : 'black'} ${moves[ply].san}`}>{moves[ply].san}</button> : <span key={column} />)}</div>)}<div ref={historyEnd} /></div><div className="history-navigation"><button className="icon-button" aria-label="First position" disabled={!shownPly} onClick={() => goTo(0)}><ChevronFirst size={19} /></button><button className="icon-button" aria-label="Previous move" disabled={!shownPly} onClick={() => goTo(shownPly - 1)}><ChevronLeft size={19} /></button><span>{shownPly} / {moves.length}</span><button className="icon-button" aria-label="Next move" disabled={shownPly >= moves.length} onClick={() => goTo(shownPly + 1)}><ChevronRight size={19} /></button><button className="icon-button" aria-label="Latest position" disabled={shownPly >= moves.length} onClick={() => goTo(moves.length)}><ChevronLast size={19} /></button></div></> : <div className="analysis-panel" role="tabpanel" aria-label="Position analysis"><div className="analysis-topline"><div><span className="field-label">POSITION EVALUATION</span><div className="analysis-score">{score}</div></div><span className="analysis-depth">{evalCurrent ? `Depth ${evalCurrent.depth}` : 'Stockfish 17.1'}</span></div><p className="analysis-copy">{evalCurrent ? evalCurrent.mate !== undefined ? `Forced mate for ${evalCurrent.mate > 0 ? 'White' : 'Black'}.` : Math.abs(evalCurrent.scoreCp ?? 0) < 40 ? 'A balanced position. There’s everything to play for.' : `${(evalCurrent.scoreCp ?? 0) > 0 ? 'White' : 'Black'} has the advantage. Positive scores favor White.` : 'Look a little deeper. Ask the engine to evaluate this position.'}</p>{pv.length > 0 && <div className="principal-variation"><span>BEST LINE</span><p>{pv.join('  ')}</p></div>}<button className="secondary-button analysis-button" disabled={thinking || !!engineError || shownGame.isGameOver()} onClick={() => void requestAnalysis()}>{thinking ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />} Analyze position</button></div>}
      <div className="game-tools"><button className="text-button" disabled={!!finished || !moves.length || reviewing} onClick={takeBack} title="Take back a move (clocks are not restored)"><RotateCcw size={14} />Take back</button><button className="text-button" disabled={!!finished || thinking || computerTurn || paused || reviewing || !!engineError} onClick={() => void requestAnalysis(true)}><Lightbulb size={14} />Hint</button><button className="text-button resign-button" disabled={!!finished || !started || paused} onClick={() => setModal('resign')}><Flag size={14} />Resign</button></div><div className="notation-tools"><button className="text-button" onClick={() => { setImportText(''); setImportError(''); setModal('import'); }}><Upload size={13} />Import</button><button className="text-button" onClick={() => void copyFen()}><Copy size={13} />Copy FEN</button><button className="text-button" onClick={exportPgn}><Download size={13} />PGN</button></div>
    </section><div className="insight-card"><span className="quote-mark">“</span><blockquote>When you see a good move,<br />look for a better one.</blockquote><span className="quote-author">EMANUEL LASKER <span>·</span> WORLD CHAMPION</span></div></aside></section>
    </main><footer className="site-footer"><div><span className="footer-knight">♞</span> A game of infinite possibilities.</div><span>DESIGNED & BUILT BY <strong>VAIBHAV THAKUR</strong></span><a className="footer-engine" href="engine/SOURCE.md" target="_blank" rel="noreferrer">Stockfish · source & license <span>↗</span></a></footer>
    {toast && <div className="toast" role="status"><Check size={16} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
    {(modal || promotion) && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setModal(null); setPromotion(null); } }}><ModalShell title={promotion ? 'Choose your promotion' : modal === 'new' ? 'A fresh perspective.' : modal === 'import' ? 'Bring your game.' : modal === 'resign' ? 'Resign this game?' : 'Welcome to the club.'} close={() => { setModal(null); setPromotion(null); }}>
      {promotion ? <><p className="modal-description">Your pawn has reached the final rank. Choose its next chapter.</p><div className="promotion-options">{(['q', 'r', 'b', 'n'] as PieceSymbol[]).map(type => <button key={type} aria-label={`Promote to ${({ q: 'queen', r: 'rook', b: 'bishop', n: 'knight', k: 'king', p: 'pawn' })[type]}`} onClick={() => commitMove(promotion.from, promotion.to, type)}><Piece type={type} color={game.turn()} /><span>{({ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', k: '', p: '' })[type]}</span></button>)}</div></> : modal === 'new' ? <><p className="modal-description">Your current game will be replaced. Choose your next challenge.</p>{settings('modal-')}<div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Keep playing</button><button className="primary-button" onClick={() => startGame()}>New game <ArrowRight size={16} /></button></div></> : modal === 'import' ? <><p className="modal-description">Load a PGN game or a FEN position for untimed, local play and analysis. This replaces your current game.</p><div className="segmented"><button className={`segment ${importType === 'pgn' ? 'active' : ''}`} onClick={() => { setImportType('pgn'); setImportError(''); }}>PGN game</button><button className={`segment ${importType === 'fen' ? 'active' : ''}`} onClick={() => { setImportType('fen'); setImportError(''); }}>FEN position</button></div><label className="form-field"><span>{importType.toUpperCase()} NOTATION</span><textarea autoFocus rows={6} value={importText} onChange={e => setImportText(e.target.value)} placeholder={importType === 'pgn' ? '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'} /></label>{importError && <p className="form-error" role="alert">{importError}</p>}<button className="primary-button" onClick={importPosition}>Load {importType === 'pgn' ? 'game' : 'position'} <ArrowRight size={16} /></button></> : modal === 'resign' ? <><p className="modal-description">{config.mode === 'computer' ? playerColor === 'w' ? 'White' : 'Black' : turnLabel} will concede this game. Every game is a lesson.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>Keep playing</button><button className="primary-button" onClick={() => { const loser = config.mode === 'computer' ? playerColor : game.turn(); generation.current++; engineRef.current?.stop(); setResult({ title: `${loser === 'w' ? 'Black' : 'White'} wins`, detail: `${loser === 'w' ? 'White' : 'Black'} resigned. A new challenge awaits.`, result: loser === 'w' ? '0-1' : '1-0' }); setModal(null); setSelected(null); }}>Resign game <Flag size={16} /></button></div></> : <><p className="modal-description">A space to play thoughtfully, practice deliberately, and enjoy the world’s most beautiful game.</p><div className="help-list"><div><span>01</span><div><h3>Make your move</h3><p>Click a piece, then a highlighted square. Use arrow keys to navigate the board and Enter or Space to select. Castling, en passant, promotion, and draw detection are built in.</p></div></div><div><span>02</span><div><h3>Find your challenge</h3><p>Play Stockfish at levels 0–20, or choose “A friend” for two players on this device. Time controls include increment. New settings apply when you start a new game.</p></div></div><div><span>03</span><div><h3>Study the position</h3><p>Review moves, request a hint, or open Analysis. Scores are from White’s perspective. Export PGN or import a position to explore. These are unrated practice games.</p></div></div><div><span>04</span><div><h3>Pick up where you left off</h3><p>Your current game saves on this device. After a page reload, it pauses until you resume. Clocks continue during move review and hints. Takebacks do not restore time.</p></div></div></div><button className="primary-button" onClick={() => setModal(null)}>Let’s play <ArrowRight size={16} /></button></>}
    </ModalShell></div>}
  </div>;
}

function ModalShell({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const root = ref.current;
    const focusable = () => Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input, select, [tabindex="0"]') ?? []);
    (root?.querySelector<HTMLElement>('[autofocus]') ?? focusable()[0])?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') { const elements = focusable(); const first = elements[0]; const last = elements[elements.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><span className="eyebrow">THAKUR CHESS CLUB</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={19} /></button></div><div className="modal-body">{children}</div></div>;
}

export default App;
