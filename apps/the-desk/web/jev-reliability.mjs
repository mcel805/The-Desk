export function reliabilityText(report){
 if(!report)return 'Jev reliability unavailable.';
 const describe=r=>r.completed?`${r.failed}/${r.completed} failed (${(100*r.failure_rate).toFixed(2)}%) · ${r.recovered} recovered by retry`:'No completed evaluations yet';
 const current=report.by_prompt?.[report.current_prompt];
 return `Jev reliability · target <1% · run: ${describe(report)}${current?` · this build: ${describe(current)}`:''}. ${report.pending} pending. ${Object.entries(report.errors||{}).map(([k,n])=>`${k}: ${n}`).join('; ')}${current?.completed&&current.failed===0&&current.zero_failure_upper_95>=.01?' · More observations needed to establish <1% at 95% confidence.':''}`;
}

export function jevErrorText(j){
 if(!j)return 'Waiting for an evaluation.';
 const code=j.error_code||j.error_class||'unknown error';
 const explanation={max_tokens_exceeded:'Request exceeded the provider context limit.',local_context_budget_exceeded:'Request withheld because its evidence exceeds the safe context budget.',invalid_api_key:'Provider rejected the API key.',freshness_deadline:'No retry could finish before the evaluation deadline.'}[code];
 return `${explanation||'Jev request failed.'} ${j.http_status?'HTTP '+j.http_status+' · ':''}${code} · ${j.attempt_count??1} attempt(s).`;
}
