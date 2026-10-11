// The bundled Vela source is already checked out in this repository.
import path from 'node:path';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const repo=process.env.TRADER_REPO||path.resolve(root,'../..');
const vela=path.join(repo,'integrations/vela');
const require=createRequire(path.join(vela,'package.json'));
const {build}=require('esbuild');
const points=[['VelaWorkspace','workspace.js'],['CoinbaseProvider','providers/coinbase.js'],['HyperliquidProvider','providers/hyperliquid.js'],['registerNativeIndicator, chartTypes','index.js'],['registerWidgetAction, registerStatePersistence, registerLegendAction, stableSeriesId, ACCENT, BULLISH, BEARISH','plugin.js'],['IndicatorPicker','widget.js']];
const contents=points.map(([name,file])=>`export {${name}} from ${JSON.stringify(path.join(vela,'dist',file))};`).join('\n');
const registrySideEffects={name:'vela-native-registries',setup(b){b.onResolve({filter:/\.js$/},args=>{const resolved=path.resolve(args.resolveDir,args.path);if(resolved.startsWith(path.join(vela,'dist')+path.sep))return {path:resolved,sideEffects:true};});}};
await build({stdin:{contents,resolveDir:vela,sourcefile:'desk-vendor-entry.mjs',loader:'js'},outfile:path.join(root,'web/vendor/vela.js'),bundle:true,format:'esm',platform:'browser',minify:true,treeShaking:false,plugins:[registrySideEffects],logLevel:'warning'});
for(const [source,dest] of [['LICENSE','VELA-LICENSE.txt'],['NOTICE','VELA-NOTICE.txt']])await fs.copyFile(path.join(vela,source),path.join(root,'web/vendor',dest));
console.log('Bundled Vela workspace, native tools/indicators, and Coinbase/Hyperliquid providers.');
