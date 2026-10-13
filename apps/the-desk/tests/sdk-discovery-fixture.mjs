/** Synthetic USB enumeration through the installed real SDK; no device I/O. */
import {createRequire} from 'node:module';
import {ledgerOperation,usbInventory} from '../native-ledger.mjs';
const require=createRequire(import.meta.url),hid=require('node-hid');
hid.devicesAsync=async()=>{await new Promise(resolve=>setTimeout(resolve,10));return [{vendorId:0x2c97,productId:0x4001,path:'test-usb-device',usagePage:0xffa0}];};
const {DeviceManagementKitBuilder}=require('@ledgerhq/device-management-kit');
const {nodeHidTransportFactory}=require('@ledgerhq/device-transport-kit-node-hid');
try {
  const scans=[];
  for(let i=0;i<2;i++)scans.push(await ledgerOperation({operation:'discover'},{dmk:new DeviceManagementKitBuilder().addTransport(nodeHidTransportFactory).build(),inventory:async()=>usbInventory(await hid.devicesAsync())}));
  process.stdout.write(JSON.stringify(scans));process.exit(0);
} catch(error){process.stderr.write(error.message);process.exit(1);}
