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

function afterThreat(chess, sufficientGain) {
  let best = { gain: -1000, line: [] };
  const responses = chess.moves({ verbose: true }).sort((a, b) => gain(b) - gain(a));
  for (const response of responses) {
    chess.move(response);
    try {
      let worst = { gain: gain(response), line: [response.san] };
      for (const reply of chess.isGameOver() ? [] : chess.moves({ verbose: true })) {
        if (reply.san.endsWith('#')) {
          worst = { gain: -1000, line: [response.san, reply.san] };
          break;
        }
        if (!reply.captured && !reply.promotion) continue;
        chess.move(reply);
        try {
          const recovery = reply.captured ? recapture(chess, reply.to, 4) : { gain: 0, line: [] };
          const net = gain(response) - gain(reply) + recovery.gain;
          if (net < worst.gain) worst = { gain: net, line: [response.san, reply.san, ...recovery.line] };
        } finally { chess.undo(); }
      }
      if (worst.gain > best.gain || !best.line.length) best = worst;
    } finally { chess.undo(); }
    if (best.gain >= sufficientGain) break;
  }
  return best;
}

function quietThreat(chess, reply) {
  if (reply.captured || reply.promotion || /[+#]$/.test(reply.san)) return false;
  const targets = chess.board().flat().filter(piece => piece && piece.color === chess.turn() && values[piece.type] >= 3 && chess.attackers(piece.square, reply.color).includes(reply.to));
  return (reply.piece === 'p' && targets.length > 0) || (reply.piece === 'n' && targets.length > 1) || targets.some(piece => values[piece.type] > values[reply.piece]);
}

export function tacticalConsequences(chess, candidate, { extendChecks = false, extendThreats = false } = {}) {
  const original = chess.fen();
  const move = chess.move({ from: candidate.from, to: candidate.to, promotion: candidate.uci[4] });
  try {
    const replies = chess.isGameOver() ? [] : chess.moves({ verbose: true });
    const threats = [];
    for (const reply of replies) {
      if (!extendThreats && !reply.captured && !reply.promotion && !/[+#]$/.test(reply.san)) continue;
      chess.move(reply);
      try {
        const quiet = extendThreats && quietThreat(chess, reply);
        if (!quiet && !reply.captured && !reply.promotion && !/[+#]$/.test(reply.san)) continue;
        const extended = extendChecks && chess.isCheck() && !chess.isCheckmate();
        const recovery = extended || quiet ? afterThreat(chess, gain(reply)) : reply.captured ? recapture(chess, reply.to, 6) : { gain: 0, line: [] };
        threats.push({
          reply: reply.san,
          capturedPiece: reply.captured || null,
          capturesMovedPiece: Boolean(reply.captured && reply.to === move.to),
          opponentCheckmates: chess.isCheckmate(),
          forcesMateAfterReply: (extended || quiet) && recovery.gain === -1000,
          extendedCheckLine: extended,
          extendedQuietThreat: quiet,
          netMaterialChangeAfterExchange: gain(move) - gain(reply) + (recovery.gain === -1000 ? 0 : recovery.gain),
          exchangeLine: [move.san, reply.san, ...recovery.line]
        });
      } finally { chess.undo(); }
    }
    return {
      immediateMaterialGain: gain(move),
      opponentCanCheckmateImmediately: threats.some(reply => reply.opponentCheckmates),
      opponentCanForceMateAfterReply: threats.some(reply => reply.forcesMateAfterReply),
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
