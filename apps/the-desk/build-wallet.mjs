import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
await build({entryPoints:['web/hyperliquid-wallet.mjs'],outfile:'web/vendor/hyperliquid-wallet.js',bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'eof'});
writeFileSync('web/vendor/WALLET-NOTICE.txt',['The Desk wallet adapter uses pinned npm dependencies.','@nktkas/hyperliquid: MIT','viem: MIT',readFileSync('node_modules/@nktkas/hyperliquid/LICENSE','utf8'),readFileSync('node_modules/viem/LICENSE','utf8')].join('\n\n'));
