import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cookieParser from "cookie-parser";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(cors({
    origin: true,
    credentials: true
  }));

  // --- GitHub OAuth Routes ---

  // 1. Return the OAuth URL for the client to open in a popup
  app.get('/api/auth/github/url', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = process.env.GITHUB_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/github/callback`;
    
    if (!clientId) {
      return res.status(500).json({ error: 'GITHUB_CLIENT_ID not configured' });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'gist user',
      response_type: 'code',
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  // 2. Callback handler for GitHub OAuth
  app.get('/auth/github/callback', async (req, res) => {
    const { code } = req.query;
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const redirectUri = process.env.GITHUB_REDIRECT_URI || `${req.protocol}://${req.get('host')}/auth/github/callback`;

    if (!code) {
      return res.status(400).send('No code provided');
    }

    try {
      // Exchange code for access token
      const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }, {
        headers: { Accept: 'application/json' }
      });

      const accessToken = tokenResponse.data.access_token;

      if (!accessToken) {
        throw new Error('Failed to obtain access token');
      }

      // Set access token in a secure, same-site=none cookie for the iframe
      res.cookie('github_token', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      // Send success message to parent window and close popup
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('OAuth Error:', error.response?.data || error.message);
      res.status(500).send('Authentication failed');
    }
  });

  // 3. Get current user profile and check if logged in
  app.get('/api/auth/me', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` }
      });
      res.json(userResponse.data);
    } catch (error: any) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // 4. Logout
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('github_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });
    res.json({ success: true });
  });

  // 5. Proxy Gist operations (to avoid exposing token to client if needed, but we use cookies)
  // Actually, we can just provide endpoints for Gist sync
  app.get('/api/gist', async (req, res) => {
    const token = req.cookies.github_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      // Find the Gist for this app
      const gistsResponse = await axios.get('https://api.github.com/gists', {
        headers: { Authorization: `token ${token}` }
      });
      
      const appGist = gistsResponse.data.find((g: any) => g.files['deepayan_os_data.json']);
      
      if (appGist) {
        const gistDetail = await axios.get(appGist.url, {
          headers: { Authorization: `token ${token}` }
        });
        const content = gistDetail.data.files['deepayan_os_data.json'].content;
        res.json({ id: appGist.id, data: JSON.parse(content) });
      } else {
        res.json({ id: null, data: null });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gist', async (req, res) => {
    const token = req.cookies.github_token;
    const { gistId, data } = req.body;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const payload = {
        description: 'Deepayan Life & Career OS Data',
        public: false,
        files: {
          'deepayan_os_data.json': {
            content: JSON.stringify(data)
          }
        }
      };

      if (gistId) {
        // Update existing
        await axios.patch(`https://api.github.com/gists/${gistId}`, payload, {
          headers: { Authorization: `token ${token}` }
        });
        res.json({ success: true, id: gistId });
      } else {
        // Create new
        const createResponse = await axios.post('https://api.github.com/gists', payload, {
          headers: { Authorization: `token ${token}` }
        });
        res.json({ success: true, id: createResponse.data.id });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
