function chooseWinner(localRow, cloudRow, entity) {
  if (!cloudRow) return { winner: 'local', reason: 'new row' };

  // Orders are append-only after close to avoid inventory corruption.
  if (entity === 'orders' && cloudRow.status === 'closed') {
    return { winner: 'cloud', reason: 'closed order is immutable' };
  }

  const localTs = new Date(localRow.updated_at).getTime();
  const cloudTs = new Date(cloudRow.updated_at).getTime();

  if (localTs > cloudTs) return { winner: 'local', reason: 'LWW by updated_at' };
  if (cloudTs > localTs) return { winner: 'cloud', reason: 'LWW by updated_at' };

  // Deterministic tie-breaker: terminal_id lexical order
  return localRow.terminal_id > cloudRow.terminal_id
    ? { winner: 'local', reason: 'tie-breaker terminal_id' }
    : { winner: 'cloud', reason: 'tie-breaker terminal_id' };
}

module.exports = { chooseWinner };
