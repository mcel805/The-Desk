import { listBrokers } from "@luxalgo/broker-sdk";

// This probe never reads credentials and never creates a broker connection.
// Count Desk will use the SDK's read-only account/trade surface through a
// separate local adapter after a provider and paper/shadow scope are approved.
const brokers = listBrokers().map((broker) => ({
  id: broker.id,
  name: broker.displayName,
  supportsBars: Boolean(broker.supportsBars),
  credentialFields: broker.credentials?.map((field) => field.key) ?? [],
}));

process.stdout.write(`${JSON.stringify({ readOnly: true, brokers }, null, 2)}\n`);
