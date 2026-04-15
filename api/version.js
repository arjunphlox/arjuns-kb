const { handleCors } = require('./_lib/supabase');
const versionData = require('../version.json');

module.exports = function handler(req, res) {
  if (handleCors(req, res)) return;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
  res.status(200).json(versionData);
};
