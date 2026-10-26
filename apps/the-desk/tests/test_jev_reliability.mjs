import test from 'node:test';
import assert from 'node:assert/strict';
import {reliabilityText,jevErrorText} from '../web/jev-reliability.mjs';
test('shows actual failures and the strict target',()=>{
 const r=reliabilityText({completed:100,failed:2,failure_rate:.02,recovered:1,pending:3,errors:{'400 / max_tokens_exceeded':2}});
 assert.match(r,/2\/100 failed \(2.00%\)/);assert.match(r,/target <1%/);assert.match(r,/3 pending/);assert.match(r,/max_tokens_exceeded/);
});
test('does not imply a small clean sample establishes the long-run rate',()=>{
 const cohort={completed:5,failed:0,failure_rate:0,recovered:0,zero_failure_upper_95:.45};
 const r=reliabilityText({...cohort,pending:0,current_prompt:'fixed',by_prompt:{fixed:cohort}});
 assert.match(r,/More observations needed/);
});
test('provider error includes the cause and HTTP status',()=>{
 assert.match(jevErrorText({http_status:400,error_code:'max_tokens_exceeded',attempt_count:1}),/HTTP 400/);
 assert.match(jevErrorText({error_code:'local_context_budget_exceeded',attempt_count:0}),/withheld/);
});
