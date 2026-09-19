export function checkingMateProof(chess) {
  if (!chess.isCheck() || chess.isGameOver()) return null;
  const defenses = [];
  for (const reply of chess.moves({ verbose: true })) {
    chess.move(reply);
    try {
      if (chess.isGameOver()) return null;
      const mate = chess.moves({ verbose: true }).find(move => move.san.endsWith('#'));
      if (!mate) return null;
      defenses.push({ reply: reply.san, mate: mate.san });
    } finally { chess.undo(); }
  }
  return defenses.length ? { plies: 3, defenses } : null;
}
