import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [react(), tailwindcss()],
	// Loopback only on purpose: the dev server has no IP allowlist of its own and
	// proxies /api from its own loopback socket, so exposing it on the LAN would
	// make every visitor look like 127.0.0.1 to the gated Express server. Test from
	// another device through the Express server (http://<this-pc>:3000) instead.
	server: {
		host: '127.0.0.1',
		proxy: {
			'/api': {
				target: 'http://localhost:3000',
				changeOrigin: true,
			},
		},
	},
	preview: {
		host: '127.0.0.1',
		port: 5173,
		strictPort: true,
		proxy: {
			'/api': {
				target: 'http://localhost:3000',
				changeOrigin: true,
			},
		},
	},
});
