# ATLAS — Global Crypto Hours / Community

Interactive Earth, world clocks and real-time public chat with a 1-second server-side message cooldown and moderation.

## Render deployment
Connect this repo to a **Node Web Service**, not a Static Site.

- Build command: `npm install` (also tries to download genuine 8K texture files)
- Start command: `node server.js`
- Instance: `Free` (for testing/hobby use)

After deployment check `/api/health` and `/api/texture-status`.

The Graphics dropdown has **Performance**, **Balanced**, and **Ultra 8K**. Ultra downloads three full-size Earth JPEG files only when selected. If the download during deployment failed, place the genuine downloaded Earth JPEGs in `textures/` with names in `textures/README.txt`, commit, and redeploy.

The site does **not** fake 8K: when assets or WebGL capacity are missing, Ultra falls back to Balanced. 

The globe imagery by [Solar System Scope](https://www.solarsystemscope.com/textures/) is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Free Render instances can sleep, and in-memory/local-file chat history is not durable across restarts. Slur filtering is automated and may miss some circumventions.
