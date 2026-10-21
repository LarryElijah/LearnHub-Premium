
(() => {
  'use strict';

  // ==========================================
  // LEARNHUB CONFIGURATION
  // ==========================================

  window.LEARNHUB_CONFIG = {
    // Supabase project URL
    SUPABASE_URL: 'https://wkcvpfkthnlqzvndmrhq.supabase.co',

    // Supabase publishable key
    SUPABASE_ANON_KEY: 'sb_publishable_M333boZjNvM3wk-DRR1yKw_Hr8I1-DC',

    // AI study assistant endpoint
    AI_ENDPOINT: '/api/study-assistant'
  };

  // ==========================================
  // CONFIGURATION CHECK
  // ==========================================

  const config = window.LEARNHUB_CONFIG;

  const isConfigured = Boolean(
    config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    config.SUPABASE_URL.startsWith('https://') &&
    !config.SUPABASE_ANON_KEY.includes('YOUR_')
  );

  if (isConfigured) {
    console.info('LearnHub configuration loaded.');
  } else {
    console.error(
      'LearnHub configuration is incomplete. Check config.js.'
    );
  }
})();
