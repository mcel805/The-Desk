export async function restoreWalletSession({controller,savedProvider,config,hardware,createPairing,forgetProvider,showChoices}) {
  if(savedProvider==='walletconnect') {
    if(!config.walletConnectProjectId) {
      forgetProvider();
      await controller.invalidate();
      showChoices();
      return false;
    }
    try {
      const pairing=createPairing(config.walletConnectProjectId),provider=await pairing.restore();
      if(provider) controller.bind(provider);
      else forgetProvider();
    } catch {
      forgetProvider();
      await controller.invalidate();
      showChoices();
      return false;
    }
  } else if(savedProvider==='ledger-usb') {
    controller.bind(hardware);
  }
  const restored=!!(await controller.restore())?.authenticated;
  if(!restored&&!controller.provider)showChoices();
  return restored;
}
