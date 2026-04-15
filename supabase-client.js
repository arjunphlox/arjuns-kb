/* === Stello — Supabase Client === */

(function () {
  'use strict';

  // Supabase configuration — anon key is safe to expose (RLS protects data)
  const SUPABASE_URL = window.STELLO_SUPABASE_URL || 'https://ngncjtzsqrrfrhgammne.supabase.co';
  const SUPABASE_ANON_KEY = window.STELLO_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nbmNqdHpzcXJyZnJoZ2FtbW5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTIyNDAsImV4cCI6MjA5MTg2ODI0MH0.Q_hRdbk6u56_pPtxyhY1D-1gmLYA5OqIvxQgE1M3GY8';

  // Upstream version check URL (Arjun's repo)
  const UPSTREAM_VERSION_URL = 'https://raw.githubusercontent.com/arjunphlox/stello/main/version.json';

  let _client = null;
  let _session = null;

  /** Initialize the Supabase client (lazy, singleton) */
  function getClient() {
    if (_client) return _client;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('Stello: Supabase URL or anon key not configured.');
      return null;
    }
    _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  }

  /** Get current session, or null if not authenticated */
  async function getSession() {
    const client = getClient();
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    _session = session;
    return session;
  }

  /** Get user ID from current session */
  function getUserId() {
    return _session?.user?.id || null;
  }

  /** Get display name from profile */
  async function getDisplayName() {
    const client = getClient();
    const userId = getUserId();
    if (!client || !userId) return null;
    const { data } = await client
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();
    return data?.display_name || _session?.user?.email || null;
  }

  /**
   * Auth guard — redirects to login.html if no session.
   * Call at the top of init() on protected pages.
   * Returns the session if authenticated.
   */
  async function requireAuth() {
    const session = await getSession();
    if (!session) {
      window.location.href = '/login.html';
      return null;
    }
    return session;
  }

  /**
   * Fetch wrapper that adds auth headers automatically.
   * Use instead of fetch() for all /api/* calls.
   */
  async function apiFetch(url, opts = {}) {
    const token = _session?.access_token;
    const headers = { ...opts.headers };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    return fetch(url, { ...opts, headers });
  }

  /**
   * Sign in with Apple OAuth via Supabase.
   */
  async function signInWithApple() {
    const client = getClient();
    if (!client) return;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin + '/api/auth-callback' }
    });
    if (error) console.error('Apple sign-in error:', error.message);
  }

  /**
   * Sign in with email and password.
   */
  async function signInWithEmail(email, password) {
    const client = getClient();
    if (!client) return { error: 'Client not initialized' };
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    _session = data.session;
    return { error: null };
  }

  /**
   * Sign up with email and password.
   */
  async function signUpWithEmail(email, password) {
    const client = getClient();
    if (!client) return { error: 'Client not initialized' };
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return { error: null, needsConfirmation: !data.session };
  }

  /**
   * Sign out and redirect to login.
   */
  async function signOut() {
    const client = getClient();
    if (client) await client.auth.signOut();
    _session = null;
    window.location.href = '/login.html';
  }

  /**
   * Check for upstream version updates.
   * Returns { available, latest, current, changelog, migration } or null.
   */
  async function checkForUpdate(currentVersion) {
    try {
      const res = await fetch(UPSTREAM_VERSION_URL, { cache: 'no-store' });
      if (!res.ok) return null;
      const remote = await res.json();
      if (remote.version !== currentVersion) {
        return {
          available: true,
          latest: remote.version,
          current: currentVersion,
          changelog: remote.changelog,
          migration: remote.migration,
          breaking_changes: remote.breaking_changes || []
        };
      }
      return { available: false };
    } catch {
      return null;
    }
  }

  // Listen for auth state changes (token refresh, sign out from another tab)
  function initAuthListener() {
    const client = getClient();
    if (!client) return;
    client.auth.onAuthStateChange((event, session) => {
      _session = session;
      if (event === 'SIGNED_OUT') {
        window.location.href = '/login.html';
      }
    });
  }

  // Expose on window for other scripts
  window.Stello = {
    getClient,
    getSession,
    getUserId,
    getDisplayName,
    requireAuth,
    apiFetch,
    signInWithApple,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    checkForUpdate,
    initAuthListener
  };
})();
