const { createClient } = require('@supabase/supabase-js');

/**
 * OAuth callback handler — Supabase redirects here after Apple sign-in.
 * Exchanges the auth code for a session, then redirects to the app.
 */
module.exports = async function handler(req, res) {
  const { code } = req.query;

  if (code) {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Exchange code for session
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirect to main app — the client-side auth guard will pick up the session.
  // ?welcome=1 triggers the one-shot post-login stagger reveal in app.js init().
  res.writeHead(302, { Location: '/?welcome=1' });
  res.end();
};
