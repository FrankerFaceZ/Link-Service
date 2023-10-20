import { build } from 'esbuild';
import { copy } from 'esbuild-plugin-copy';

await build({
	entryPoints: ['./lib/**/*'],
	bundle: false,
	format: 'cjs',
	platform: 'node',
	target: ['node16'],
	packages: 'external',
	outdir: 'dist',
	plugins: [
		copy({
			assets: {
				from: ['./lib/**/*.json'],
				to: ['.']
			}
		})
	]
});
