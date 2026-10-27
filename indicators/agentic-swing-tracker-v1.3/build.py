from pathlib import Path
import hashlib,json
here=Path(__file__).parent
base=here/'baseline/Agentic_Swing_Tracker_v1_2.pine'
source=base.read_text()
settings,body=(here/'warnings.pine').read_text().split('// WARNING_ENGINE_BODY',1)
source=source.replace('Agentic - Swing Tracker 1.2','Agentic - Swing Tracker 1.3').replace('AG Swing 1.2','AG Swing 1.3').replace('research-v1.2','research-v1.3')
insert=source.index('\nstring S=')
source=source[:insert]+'\n'+settings+source[insert:]
# One batched observation stream avoids combining per-event alerts with 15s samples.
source=source.replace('if dynamicAlerts and barstate.isrealtime and barstate.isconfirmed','if dynamicAlerts and not (wWarningStream and wEnabled) and barstate.isrealtime and barstate.isconfirmed')
source=source.replace('"1.2 · "+swingTimeframe','"1.3 · "+swingTimeframe')
output=here/'Agentic_Swing_Tracker_v1_3.pine'
output.write_text(source+'\n'+body)
(here/'source-manifest.json').write_text(json.dumps({'base':str(base.relative_to(here)),'base_sha256':hashlib.sha256(base.read_bytes()).hexdigest(),'output_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'revision':'swing-warnings-1.3.0'},indent=2)+'\n')
print(output)
