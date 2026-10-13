// Isolated test signer: a public synthetic key. Never contacts USB or a venue.
import {privateKeyToAccount} from 'viem/accounts';
const account=privateKeyToAccount('0x'+'1'.repeat(64));
let raw='';for await(const c of process.stdin)raw+=c;
const p=JSON.parse(raw);
let result;
switch(p.operation){
  case 'capabilities':result={available:true};break;
  case 'discover':result={devices:[{id:'a'.repeat(64),name:'Ledger · SYNTHETIC FIXTURE'}]};break;
  case 'account':result={address:account.address,path:p.scheme==='ledger-live'?`44'/60'/${p.index}'/0/0`:`44'/60'/0'/0/${p.index}`};break;
  case 'sign-login':result={address:account.address,signature:await account.signMessage({message:p.message})};break;
  default:throw new Error('Unsupported fixture operation');
}
process.stdout.write(JSON.stringify({ok:true,...result}));
