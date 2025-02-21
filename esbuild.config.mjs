import esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';

const production = process.argv[2] === 'production';

const ctx = await esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    format: 'cjs',
    outfile: 'main.js',
    platform: 'node',
    sourcemap: !production,
    minify: production,
    plugins: [nodeExternalsPlugin()],
    external: ['obsidian']
});

if (production) {
    await ctx.rebuild();
    process.exit(0);
} else {
    await ctx.watch();
    console.log('Watching...');
} 