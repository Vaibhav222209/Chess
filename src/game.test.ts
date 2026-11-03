import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { copyGame, formatClock, gameResult, historyRows, lineToSan, positionsOf, timeoutResult } from './game';

describe('game rules and study tools', () => {
  it('preserves move history and repetition when copying a game', () => {
    const game = new Chess();
    ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach(move => game.move(move));
    const copy = copyGame(game);
    expect(copy.history()).toEqual(game.history());
    expect(gameResult(copy)?.title).toBe('Draw by repetition');
  });

  it('detects checkmate with the correct winner', () => {
    const game = new Chess();
    ['f3', 'e5', 'g4', 'Qh4#'].forEach(move => game.move(move));
    expect(gameResult(game)).toMatchObject({ title: 'Black wins', result: '0-1' });
    expect(game.moves()).toHaveLength(0);
  });

  it('distinguishes stalemate from checkmate', () => {
    expect(gameResult(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toMatchObject({ title: 'Draw by stalemate', result: '1/2-1/2' });
  });

  it('draws king-only and same-color bishop endings', () => {
    expect(gameResult(new Chess('7k/8/6K1/8/8/8/8/8 w - - 0 1'))?.title).toContain('insufficient material');
    expect(gameResult(new Chess('5b1k/8/6K1/8/8/8/8/2B5 w - - 0 1'))?.title).toContain('insufficient material');
  });

  it('retains a custom initial position in PGN copies and review timeline', () => {
    const game = new Chess('4k3/8/8/8/8/8/4P3/4K3 w - - 0 24');
    game.move('e4');
    const copy = copyGame(game);
    expect(copy.fen()).toEqual(game.fen());
    expect(positionsOf(copy)).toEqual([game.history({ verbose: true })[0].before, game.fen()]);
    expect(copy.undo()?.san).toBe('e4');
    expect(copy.fen()).toContain(' 24');
  });

  it('awards time forfeits and draws when the opponent has only a king', () => {
    expect(timeoutResult(new Chess(), 'w')).toMatchObject({ title: 'Black wins on time', result: '0-1' });
    expect(timeoutResult(new Chess('7k/8/6K1/8/8/8/P7/8 w - - 0 1'), 'w').result).toBe('1/2-1/2');
  });

  it('converts engine principal variations to readable legal notation', () => {
    expect(lineToSan(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3', 'z9z1'])).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('preserves en passant and castling availability when copying', () => {
    const game = new Chess('r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 0 10');
    const copy = copyGame(game);
    expect(copy.moves()).toContain('exd6');
    expect(copy.moves()).toContain('O-O');
    expect(copy.moves()).toContain('O-O-O');
  });

  it('formats clocks with ceiling seconds and no negative display', () => {
    expect(formatClock(600000)).toBe('10:00');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(-1)).toBe('00:00');
  });

  it('groups a custom black-to-move history with its real fullmove numbers', () => {
    const game = new Chess('r3k2r/ppp2ppp/2n5/3pp3/3PP3/2N5/PPP2PPP/R3K2R b KQkq - 0 23');
    game.move('exd4'); game.move('Nxd5');
    expect(historyRows(game)).toEqual([{ number: 23, black: 0 }, { number: 24, white: 1 }]);
  });
});
