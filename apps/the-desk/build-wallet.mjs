import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
await build({entryPoints:['web/hyperliquid-wallet.mjs'],outfile:'web/vendor/hyperliquid-wallet.js',bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'eof'});
await build({entryPoints:['web/wallet-transports.mjs'],outfile:'web/vendor/wallet-transports.js',bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'eof'});
await build({entryPoints:['web/wallet-qr.mjs'],outfile:'web/vendor/wallet-qr.js',bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'eof'});
writeFileSync('web/vendor/WALLET-NOTICE.txt',['The Desk wallet adapter uses pinned npm dependencies.','@nktkas/hyperliquid: MIT','viem: MIT','Portions © 2025 Reown, Inc. All Rights Reserved','@walletconnect/ethereum-provider: WalletConnect Community License Agreement','qrcode: MIT',readFileSync('node_modules/@walletconnect/ethereum-provider/LICENSE.md','utf8'),readFileSync('node_modules/qrcode/license','utf8'),readFileSync('node_modules/@nktkas/hyperliquid/LICENSE','utf8'),readFileSync('node_modules/viem/LICENSE','utf8')].join('\n\n'));
