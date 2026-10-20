"""Universal execution contract. A data connector is not an execution grant."""
VENUES = {
    'simulation': {'name':'Simulation','status':'available','read':True,'preview':True,'submit':True,'cancel':True,'reconcile':True,'autonomous':True,'reason':'Existing local paper engine; simulated matching and fees.'},
    'robinhood': {'name':'Robinhood','status':'preview-only','read':True,'preview':True,'submit':False,'cancel':False,'reconcile':False,'autonomous':False,'reason':'Separate Desk OAuth grant. Native manual previews exist; autonomous order routing is not verified.'},
    'hyperliquid': {'name':'Hyperliquid','status':'signature-required','read':True,'preview':False,'submit':False,'cancel':False,'reconcile':False,'autonomous':False,'reason':'Wallet-signed actions remain in the wallet workspace. No unattended agent signing authority.'},
    'coinbase': {'name':'Coinbase','status':'not-configured','read':False,'preview':False,'submit':False,'cancel':False,'reconcile':False,'autonomous':False,'reason':'Public chart data is available; a trading-account adapter and credentials are not configured.'},
    'binance': {'name':'Binance','status':'not-configured','read':False,'preview':False,'submit':False,'cancel':False,'reconcile':False,'autonomous':False,'reason':'Trading-account adapter, regional eligibility and credentials require verification.'},
    'ibkr': {'name':'Interactive Brokers','status':'data-only','read':False,'preview':False,'submit':False,'cancel':False,'reconcile':False,'autonomous':False,'reason':'Existing IBKR integration is market data only; broker execution is not configured.'},
}


class ExecutionAdapter:
    """Adapters must implement all actions and refuse unavailable capabilities."""
    def __init__(self, venue, engine):
        if venue not in VENUES: raise ValueError('Unknown execution venue.')
        self.venue,self.engine=venue,engine

    def require(self, capability):
        if not VENUES[self.venue].get(capability): raise ValueError(VENUES[self.venue]['reason'])

    def accounts(self):
        self.require('read')
        if self.venue!='simulation':raise ValueError('Use the venue connection workspace with its own verified account grant.')
        return self.engine.state()['accounts']

    def preview(self, db, intent):
        self.require('preview')
        if self.venue!='simulation':raise ValueError('Native broker previews require that venue’s authenticated workspace.')
        self.engine.account(db,intent['account_id']);self.engine.instrument(intent['instrument'])
        q=self.engine.quote(intent['instrument'])
        return {'venue':self.venue,'simulation':True,'intent':intent,'bid':q['bid'],'ask':q['ask'],'observedAt':q['received_at'],'execution':'Not submitted'}

    def reconcile(self, db, order_ids):
        self.require('reconcile')
        # The caller supplies its attributed IDs, not an account-wide ledger.
        return [dict(row) for order_id in order_ids for row in db.execute('SELECT * FROM orders WHERE id=?',(order_id,))]

    def submit(self, db, intent):
        self.require('autonomous');self.require('submit')
        return self.engine.create_order(db,intent)

    def cancel(self, db, order):
        self.require('cancel')
        return self.engine.cancel(db,{'account_id':order['account_id'],'id':order['id'],'revision':order['revision']})

    def close(self, db, position):
        self.require('submit')
        return self.engine.close(db,{'account_id':position['account_id'],'id':position['id'],'revision':position['revision']})
