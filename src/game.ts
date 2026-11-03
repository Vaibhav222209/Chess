import { Chess, type Color } from 'chess.js';

export type GameResult = { title: string; detail: string; result: '1-0' | '0-1' | '1/2-1/2' };
export type GameConfig = { mode: 'computer' | 'local'; color: Color | 'random'; minutes: number; increment: number; skill: number };
export const DEFAULT_CONFIG: GameConfig = { mode: 'computer', color: 'w', minutes: 10, increment: 5, skill: 12 };

export function copyGame(game: Chess): Chess {
  const copy = new Chess();
  copy.loadPgn(game.pgn());
  return copy;
}

export function gameResult(game: Chess): GameResult | null {
  if (game.isCheckmate()) return { title: `${game.turn() === 'w' ? 'Black' : 'White'} wins`, detail: 'A decisive finish. Checkmate.', result: game.turn() === 'w' ? '0-1' : '1-0' };
  if (game.isStalemate()) return { title: 'Draw by stalemate', detail: 'No legal moves, but the king is safe.', result: '1/2-1/2' };
  if (game.isThreefoldRepetition()) return { title: 'Draw by repetition', detail: 'The same position has appeared three times.', result: '1/2-1/2' };
  if (game.isInsufficientMaterial()) return { title: 'Draw · insufficient material', detail: 'Neither side has enough material to checkmate.', result: '1/2-1/2' };
  if (game.isDrawByFiftyMoves()) return { title: 'Draw · fifty-move rule', detail: 'Fifty moves without a pawn move or capture.', result: '1/2-1/2' };
  return null;
}

export function timeoutResult(game: Chess, flagged: Color): GameResult {
  const winner = flagged === 'w' ? 'b' : 'w';
  const pieces = game.board().flat().filter(p => p?.color === winner && p.type !== 'k');
  if (game.isInsufficientMaterial() || pieces.length === 0) return { title: 'Draw on time', detail: 'The opponent cannot checkmate with their material.', result: '1/2-1/2' };
  return { title: `${winner === 'w' ? 'White' : 'Black'} wins on time`, detail: `${flagged === 'w' ? 'White' : 'Black'} ran out of time.`, result: winner === 'w' ? '1-0' : '0-1' };
}

export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function lineToSan(fen: string, moves: string[], limit = 7): string[] {
  const position = new Chess(fen);
  const san: string[] = [];
  for (const uci of moves.slice(0, limit)) {
    try { san.push(position.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }).san); }
    catch { break; }
  }
  return san;
}

export function positionsOf(game: Chess): string[] {
  const moves = game.history({ verbose: true });
  if (!moves.length) return [game.fen()];
  return [moves[0].before, ...moves.map(move => move.after)];
}

export function historyRows(game: Chess): { number: number; white?: number; black?: number }[] {
  const rows: { number: number; white?: number; black?: number }[] = [];
  game.history({ verbose: true }).forEach((move, ply) => {
    const number = Number(move.before.split(' ')[5]);
    if (rows.at(-1)?.number !== number) rows.push({ number });
    rows[rows.length - 1][move.color === 'w' ? 'white' : 'black'] = ply;
  });
  return rows;
}
