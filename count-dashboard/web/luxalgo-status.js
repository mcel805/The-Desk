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
    luxalgoSummary.textContent = `Open-source MCP ${mcp.installed ? 'installed' : 'missing'} · ${mcp.enabledForCleo ? 'enabled for Cleo' : 'disabled by default'} · ${sdk.brokers?.length || 0} broker adapters cataloged. No authorization service or execution route is enabled.`;
    luxalgoList.innerHTML = [
      luxalgoRow('Open-source MCP', mcp.enabledForCleo ? 'enabled' : 'disabled', `${mcp.allowedTools?.length || 0} allowlisted read tools · writes ${mcp.writeToolsEnabled ? 'enabled' : 'disabled'}`),
      luxalgoRow('Broker SDK', sdk.catalogAvailable ? 'catalog_ready' : 'not_configured', `${sdk.brokers?.map(item => item.name || item.id).slice(0, 4).join(', ') || 'No catalog'} · account writes disabled`),
      luxalgoRow('Trade Journal', journal.status, `${journal.brokerImport || 'Local journal boundary'} · local mode needs no LuxAlgo authorization`),
      luxalgoRow('Edge Stats', edge.status, 'Vendored local engine · paper bars/fills only · sample, CI, freshness, and uncertainty required'),
      luxalgoRow('Optional tools', 'paper_only', `Prop Firm Sim ${optional.propFirmSim?.status || 'gated'} · trackers ${optional.marketTrackers?.status || 'gated'} · Trade Relay ${optional.tradeRelay?.status || 'disabled'}`),
    ].join('');
  } catch (error) {
    luxalgoSummary.textContent = error.message;
    luxalgoList.innerHTML = luxalgoRow('Integration status', 'unavailable', 'The local Count Desk status endpoint could not be reached.');
  }
}

void loadLuxalgoStatus();
