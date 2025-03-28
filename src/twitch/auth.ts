import { Router } from 'express';
import { setupLogger } from '../utils/logger';
import crypto from 'crypto';
import session from 'express-session';

const logger = setupLogger();

// Declare state storage for CSRF protection
const stateMap = new Map<string, { expiry: Date }>();

// Create the Twitch auth router
export function createTwitchAuthRouter() {
  const router = Router();

  // Get from environment or config
  const clientId = process.env.TWITCH_CLIENT_ID || '';
  const redirectUri = process.env.TWITCH_REDIRECT_URI || 'http://localhost:3000/auth/twitch/callback';
  const scopes = ['chat:read', 'chat:write'];

  if (!clientId) {
    logger.error('Missing TWITCH_CLIENT_ID environment variable');
  }

  // Login endpoint - redirects to Twitch for authorization
  router.get('/login', (req, res) => {
    // Generate random state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store state with 10 minute expiry
    stateMap.set(state, {
      expiry: new Date(Date.now() + 10 * 60 * 1000)
    });
    
    // Clean up expired states
    cleanupExpiredStates();
    
    // Redirect to Twitch authorization endpoint
    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('scope', scopes.join(' '));
    authUrl.searchParams.append('state', state);
    
    logger.info(`Redirecting to Twitch for authorization: ${authUrl.toString()}`);
    res.redirect(authUrl.toString());
  });

  // Callback page that will receive the token via the hash fragment
  router.get('/callback', (req, res) => {
    // Serve a simple HTML page that extracts the token from URL hash
    // and sends it back to the server
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authenticating with Twitch...</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; }
          .success { color: green; }
          .error { color: red; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Twitch Authentication</h1>
          <div id="status">Processing authentication...</div>
        </div>
        
        <script>
          // Function to parse hash parameters
          function parseHash() {
            const hash = window.location.hash.substring(1);
            return hash.split('&').reduce((result, item) => {
              const parts = item.split('=');
              result[parts[0]] = decodeURIComponent(parts[1]);
              return result;
            }, {});
          }
          
          // Extract token from URL hash
          const params = parseHash();
          const statusDiv = document.getElementById('status');
          
          if (params.access_token) {
            // Got a token, send to server
            statusDiv.innerHTML = '<p>Authentication successful! Saving token...</p>';
            
            fetch('/auth/twitch/store-token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                access_token: params.access_token,
                state: params.state
              })
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                statusDiv.innerHTML = '<p class="success">Authentication complete! Redirecting...</p>';
                setTimeout(() => {
                  window.location.href = '/';
                }, 2000);
              } else {
                statusDiv.innerHTML = '<p class="error">Error: ' + data.error + '</p>';
              }
            })
            .catch(error => {
              statusDiv.innerHTML = '<p class="error">Error saving token: ' + error.message + '</p>';
            });
          } else if (params.error) {
            statusDiv.innerHTML = '<p class="error">Authentication error: ' + params.error + '</p>';
          } else {
            statusDiv.innerHTML = '<p class="error">No token received from Twitch</p>';
          }
        </script>
      </body>
      </html>
    `);
  });
  
  // Endpoint to store the token from the callback page
  router.post('/store-token', (req, res) => {
    const { access_token, state } = req.body;
    
    // Validate state to prevent CSRF
    if (!state || !stateMap.has(state)) {
      logger.error('Invalid state parameter in token storage request');
      return res.status(400).json({ success: false, error: 'Invalid state parameter' });
    }
    
    // Remove state as it's been used
    stateMap.delete(state);
    
    // Check for token
    if (!access_token) {
      return res.status(400).json({ success: false, error: 'Missing access token' });
    }
    
    // Store in session if available
    if (req.session) {
      req.session.twitchToken = access_token;
      req.session.authenticated = true;
    }
    
    // Store in environment for application use
    const formattedToken = access_token.startsWith('oauth:') ? access_token : `oauth:${access_token}`;
    process.env.TWITCH_OAUTH_TOKEN = formattedToken;
    
    logger.info('Successfully stored Twitch authentication token');
    res.json({ success: true });
  });

  // Status endpoint to check if authenticated
  router.get('/status', (req, res) => {
    const isAuthenticated = !!(process.env.TWITCH_OAUTH_TOKEN || 
      (req.session && req.session.authenticated));
      
    res.json({ 
      authenticated: isAuthenticated,
      username: process.env.TWITCH_USERNAME || null
    });
  });

  // Logout endpoint
  router.get('/logout', (req, res) => {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Error destroying session', { error: err });
        }
      });
    }
    
    // Also clear from environment
    delete process.env.TWITCH_OAUTH_TOKEN;
    
    res.redirect('/');
  });

  return router;
}

// Utility to clean up expired states
function cleanupExpiredStates() {
  const now = new Date();
  for (const [state, data] of stateMap.entries()) {
    if (data.expiry < now) {
      stateMap.delete(state);
    }
  }
} 