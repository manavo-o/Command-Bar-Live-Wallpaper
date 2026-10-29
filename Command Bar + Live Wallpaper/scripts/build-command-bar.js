const esbuild = require('esbuild');
const options = {
  entryPoints: ['command-bar/ui/command-bar-view.jsx'],
  outfile: 'command-bar/command-bar-view.bundle.js',
  bundle: true, format: 'iife', platform: 'browser', target: 'chrome109',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true, legalComments: 'eof'
};
(async () => {
  if (process.argv.includes('--watch')) await (await esbuild.context(options)).watch();
  else await esbuild.build(options);
})().catch(error => { console.error(error); process.exitCode = 1; });
