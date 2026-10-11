import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const dependencies=process.env.PINE_BUILD_DIR||root;
const require=createRequire(path.join(dependencies,'package.json'));
const {build}=require('esbuild');
await build({stdin:{contents:"export {PineWorkerEngine} from '@luxalgo/vela-pinets';",resolveDir:dependencies,loader:'js'},outfile:path.join(root,'web/vendor/pine-engine.js'),bundle:true,format:'esm',platform:'browser',minify:true,external:['./vela.js'],plugins:[{name:'one-vela',setup(b){b.onResolve({filter:/^@luxalgo\/vela(?:\/.*)?$/},()=>({path:'./vela.js',external:true}));}}]});
await fs.copyFile(path.join(dependencies,'node_modules/@luxalgo/vela-pinets/LICENSE'),path.join(root,'web/vendor/PINE-AGPL-LICENSE.txt'));
await fs.writeFile(path.join(root,'web/vendor/PINE-NOTICE.txt'),'The Desk Pine adapter: @luxalgo/vela-pinets 0.2.15 and PineTS 0.11.0 by LuxAlgo. AGPL-3.0-only.\nOriginal source: https://github.com/LuxAlgo/Vela-pinets and https://github.com/LuxAlgo/PineTS\nCleo nested-security host extension and copied HTF/LTF sampling helpers: AGPL-3.0-only; editable source in web/pine-compat/ and web/pine-compatible-worker.mjs.\nThe supplied Market Gravity Pine source retains its MPL-2.0 notice and YinYangAlgorithms attribution.\n');

// A compatible worker uses the same pinned public engine with scoped host fixes.
await build({entryPoints:[path.join(root,"web/pine-compatible-worker.mjs")],outfile:path.join(root,"web/vendor/pine-compatible-worker.js"),bundle:true,format:"iife",platform:"browser",minify:true,absWorkingDir:dependencies});
