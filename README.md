# ATLAS — Global Crypto Hours / Community

A real-time chat site with a rotating globe, GPU presets, regional clocks, 1-second server-enforced message cooldown and moderation.

## How to update your existing Render site

1. Extract the ZIP. On GitHub in your existing `atlas-global-chat` repo, use **Add file → Upload files** and add the replacement files, including the entire `scripts` directory. You do **not** need to delete the repository or create another Render service.
2. In Render set Build: `npm install`, Start: `node server.js`, Runtime: Node, and trigger **Manual Deploy → Clear build cache & deploy** if required.
3. Open `https://YOUR-RENDER-SITE.onrender.com/api/texture-status`. `available:true` means all 8K JPEGs are installed, `loading:true` means the server is attempting to download them, and `missing` lists assets that could not be fetched.

## 8K textures

The app now defaults to Ultra 8K for visitors with compatible WebGL GPUs; saved choices of Performance or Balanced take precedence. The build **attempts several providers** for each genuine 8192×4096 day/night/cloud map. If the build failed, the server retries automatically at startup and the browser waits while the retry is running. It never pretends a low-resolution map is 8K.

For reliable 8K even if external sites are down, download these genuine textures from https://sites.solarsystemscope.com/textures/ and upload them to GitHub under `textures/`:

- `8k_earth_daymap.jpg`
- `8k_earth_nightmap.jpg`
- `8k_earth_clouds.jpg`

The three files are **not bundled in this ZIP**, because this sandbox cannot retrieve the original full-resolution images. This ZIP includes the automatic downloader and correctly handles their presence/absence.

## Globe labels

Geographic labels must rotate *with their actual location on the sphere*. Their DOM positions now use GPU transforms and update on every globe frame, avoiding the delayed position updates that looked like the labels were sliding. Off-globe labels are hidden. Labels fade while you drag the globe, then return pinned to their locations when you release it.

## Chat and host

Render Free Web Services can sleep when idle. Live chat works across visitors on one active service but history isn't persisted reliably across restarts.

Imagery: [Solar System Scope](https://sites.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
