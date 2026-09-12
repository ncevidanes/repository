function healthHandler(ping) {
  return async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await ping();
      res.status(200).json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'down' });
    }
  };
}

module.exports = { healthHandler };
