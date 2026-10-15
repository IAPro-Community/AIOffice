export function recoverMissedFeedItems(incomingItems, previousItems, previousSeenIds) {
  const seen = new Set(previousSeenIds);
  const hadHistory = seen.size > 0 || previousItems.length > 0;
  const newestPrevious = previousItems.reduce((newest, item) => {
    if (!item?.id) return newest;
    const at = Number(item.activity?.at) || 0;
    return !newest || at >= newest.at ? { id: item.id, at } : newest;
  }, undefined);
  const gap = Boolean(hadHistory && newestPrevious && !incomingItems.some((item) => item?.id === newestPrevious.id));
  const fresh = hadHistory
    ? incomingItems.filter((item) => item?.id && !seen.has(item.id))
    : [];
  return { fresh, gap };
}
