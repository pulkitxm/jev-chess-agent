const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const gain = move => (values[move.captured] || 0) + (move.promotion ? values[move.promotion] - 1 : 0);

function recapture(chess, square, depth) {
  if (!depth) return { gain: 0, line: [] };
  let best = { gain: 0, line: [] };
  for (const move of chess.moves({ verbose: true }).filter(move => move.captured && move.to === square)) {
    chess.move(move);
    const response = recapture(chess, square, depth - 1);
    chess.undo();
    const net = gain(move) - response.gain;
    if (net > best.gain) best = { gain: net, line: [move.san, ...response.line] };
  }
  return best;
}

export function tacticalConsequences(chess, candidate) {
  const original = chess.fen();
  const move = chess.move({ from: candidate.from, to: candidate.to, promotion: candidate.uci[4] });
  try {
    const replies = chess.moves({ verbose: true });
    const threats = [];
    for (const reply of replies) {
      if (!reply.captured && !reply.promotion && !/[+#]$/.test(reply.san)) continue;
      chess.move(reply);
      try {
        const recovery = reply.captured ? recapture(chess, reply.to, 6) : { gain: 0, line: [] };
        threats.push({
          reply: reply.san,
          capturedPiece: reply.captured || null,
          capturesMovedPiece: Boolean(reply.captured && reply.to === move.to),
          opponentCheckmates: chess.isCheckmate(),
          netMaterialChangeAfterExchange: gain(move) - gain(reply) + recovery.gain,
          exchangeLine: [move.san, reply.san, ...recovery.line]
        });
      } finally { chess.undo(); }
    }
    return {
      immediateMaterialGain: gain(move),
      opponentCanCheckmateImmediately: threats.some(reply => reply.opponentCheckmates),
      worstMaterialChangeInListedExchanges: Math.min(gain(move), ...threats.map(reply => reply.netMaterialChangeAfterExchange)),
      opponentLegalReplies: replies.map(reply => reply.san),
      forcingReplies: threats,
      resultingFen: chess.fen()
    };
  } finally {
    chess.undo();
    if (chess.fen() !== original) throw new Error('Tactical analysis changed the position');
  }
}
