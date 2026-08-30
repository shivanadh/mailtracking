const { google } = require('googleapis');
const { getDb } = require('./db');

async function getSetting(key) {
  const db = await getDb();
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  const db = await getDb();
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

async function getSettings() {
  const db = await getDb();
  const rows = await db.all('SELECT key, value FROM settings');
  const result = {};
  rows.forEach(r => {
    result[r.key] = r.value;
  });
  return {
    clientId: result.clientId || '',
    clientSecret: result.clientSecret || '',
    redirectUri: result.redirectUri || process.env.REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback',
    refreshToken: result.refreshToken || '',
    userEmail: result.userEmail || '',
    mode: result.mode || 'simulation' // 'oauth' or 'simulation'
  };
}

async function saveSettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    if (value !== undefined) {
      await setSetting(key, String(value));
    }
  }
}

async function getOAuth2Client(overrideRedirectUri) {
  const config = await getSettings();
  if (!config.clientId || !config.clientSecret) {
    return null;
  }

  const redirectUri = overrideRedirectUri || config.redirectUri;

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    redirectUri
  );

  if (config.refreshToken) {
    oauth2Client.setCredentials({
      refresh_token: config.refreshToken
    });
  }

  return oauth2Client;
}

async function generateAuthUrl(overrideRedirectUri) {
  const oauth2Client = await getOAuth2Client(overrideRedirectUri);
  if (!oauth2Client) {
    throw new Error('Google Client ID and Client Secret must be configured first.');
  }

  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

async function handleAuthCallback(code, overrideRedirectUri) {
  const oauth2Client = await getOAuth2Client(overrideRedirectUri);
  if (!oauth2Client) {
    throw new Error('OAuth client not initialized.');
  }

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (tokens.refresh_token) {
    await setSetting('refreshToken', tokens.refresh_token);
  }

  // Get user info to fetch email address
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  
  if (userInfo.data.email) {
    await setSetting('userEmail', userInfo.data.email);
  }
  
  await setSetting('mode', 'oauth');

  return userInfo.data;
}

module.exports = {
  getSettings,
  saveSettings,
  getOAuth2Client,
  generateAuthUrl,
  handleAuthCallback
};
