import preact from '@preact/preset-vite'
import { defineConfig, type Plugin } from 'vite'

/** Serve the Vercel functions in /api during local development. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z-]+)(\?.*)?$/)
        if (!m) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`)
          const r: Response = await mod.GET(new Request(`http://localhost${req.url}`))
          res.statusCode = r.status
          r.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await r.arrayBuffer()))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [preact(), devApi()],
  server: { port: 5199, strictPort: true },
  preview: { port: 5199 },
  build: { chunkSizeWarningLimit: 1500 },
})
