const luxalgoSummary = document.querySelector('#luxalgoIntegrationSummary');
const luxalgoList = document.querySelector('#luxalgoIntegrationList');

function luxalgoStateLabel(value) {
  return String(value || 'unknown').replaceAll('_', ' ').toUpperCase();
}

function luxalgoRow(label, state, detail) {
  return `<div class="luxalgo-integration-row"><span><strong>${label}</strong><small>${detail}</small></span><b data-state="${String(state || 'unknown')}">${luxalgoStateLabel(state)}</b></div>`;
}

async function loadLuxalgoStatus() {
  if (!luxalgoSummary || !luxalgoList) return;
  try {
    const response = await fetch('/api/integrations/luxalgo', {cache: 'no-store'});
    const status = await response.json();
    if (!response.ok) throw new Error(status.error || 'Integration status unavailable.');
    const mcp = status.mcp || {};
    const sdk = status.brokerSdk || {};
    const journal = status.tradeJournal || {};
    const edge = status.edgeStats || {};
    const optional = status.optionalModules || {};
    luxalgoSummary.textContent = `Self-hosted LuxAlgo Trade Journal ${journal.status === 'self_hosted_running' ? 'running locally' : 'unavailable'} · Vela trade charts included · ${sdk.brokers?.length || 0} broker adapters cataloged. No account source or Clipper schedule is configured by Count Desk.`;
    luxalgoList.innerHTML = [
      luxalgoRow('Open-source MCP', mcp.enabledForCleo ? 'enabled' : 'disabled', `${mcp.allowedTools?.length || 0} allowlisted read tools · writes ${mcp.writeToolsEnabled ? 'enabled' : 'disabled'}`),
      luxalgoRow('Broker SDK', sdk.catalogAvailable ? 'catalog_ready' : 'not_configured', `${sdk.brokers?.map(item => item.name || item.id).slice(0, 4).join(', ') || 'No catalog'} · account writes disabled`),
      luxalgoRow('Trade Journal', journal.status, `Vela trade charts · Count Desk bridge ${journal.countDeskBridge ? 'connected' : 'pending'} · Clipper ${journal.clipperScheduled ? 'scheduled' : 'not scheduled'}`),
      luxalgoRow('Edge Stats', edge.status, 'Vendored engine source available · paper bars/fills only · sample, CI, freshness, and uncertainty required'),
      luxalgoRow('Optional tools', 'paper_only', `Prop Firm Sim ${optional.propFirmSim?.status || 'gated'} · trackers ${optional.marketTrackers?.status || 'gated'} · Trade Relay ${optional.tradeRelay?.status || 'disabled'}`),
    ].join('');
  } catch (error) {
    luxalgoSummary.textContent = error.message;
    luxalgoList.innerHTML = luxalgoRow('Integration status', 'unavailable', 'The local Count Desk status endpoint could not be reached.');
  }
}

void loadLuxalgoStatus();
