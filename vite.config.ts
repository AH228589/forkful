import preact from '@preact/preset-vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Serve the Vercel functions in /api during local development. */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      Object.assign(process.env, env)
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z-]+)(\?.*)?$/)
        if (!m) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`)
          const handler = mod[req.method ?? 'GET']
          if (!handler) {
            res.statusCode = 405
            return res.end()
          }
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const body = chunks.length ? Buffer.concat(chunks) : undefined
          const r: Response = await handler(new Request(`http://localhost${req.url}`, { method: req.method, headers, body }))
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

export default defineConfig(({ mode }) => ({
  plugins: [preact(), devApi(loadEnv(mode, process.cwd(), ''))],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: { port: 5199, strictPort: true },
  preview: { port: 5199 },
  build: { chunkSizeWarningLimit: 1500 },
}))
