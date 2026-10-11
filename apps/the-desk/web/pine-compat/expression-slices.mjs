// SPDX-License-Identifier: AGPL-3.0-only
import {parse} from 'acorn';
import {simple} from 'acorn-walk';
// Isolate security expressions whose only local dependencies are
// generated immutable parameter wrappers. Stateful function bodies execute whole.
// Other expression shapes retain the full execution-and-capture path.
export function expressionSlices(fn){
 const source=fn.toString(),ast=parse('('+source+')',{ecmaVersion:'latest'}),root=ast.body[0].expression,statements=root.body.body,decls=new Map(),targets=new Map();
 const requestCall=n=>n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.name==='request'&&n.callee.property.name==='security';
 simple(root,{VariableDeclarator(n){if(n.id.type==='Identifier'&&/^p\d+$/.test(n.id.name))decls.set(n.id.name,n);},CallExpression(n){if(requestCall(n)&&n.arguments[2]?.type==='Identifier')targets.set(n.arguments[2].name,n);}});
 let boundary=statements.findIndex(s=>{if(s.type==='FunctionDeclaration')return false;let has=false;simple(s,{CallExpression(n){if(requestCall(n))has=true;}});return has;});if(boundary<0)return new Map();
 const prefix=statements.slice(0,boundary).map(n=>source.slice(n.start-1,n.end-1)).join('\n'),result=new Map();
 for(const name of targets.keys()){
  const target=decls.get(name),init=target?.init?.type==='AwaitExpression'?target.init.argument:target?.init,thunk=init?.arguments?.[0],expr=thunk?.type==='ArrowFunctionExpression'?thunk.body:thunk;
  if(!expr)continue;
  const ordered=[],seen=new Set();let safe=true;
  const add=n=>{if(seen.has(n))return;seen.add(n);const d=decls.get(n);if(!d){safe=false;return;}simple(d.init,{Identifier(i){if(/^p\d+$/.test(i.name)&&i.name!==n)add(i.name);},MemberExpression(m){if(m.object?.type==='MemberExpression'&&m.object.object?.name==='$$'&&m.object.property?.name!=='id')safe=false;}});ordered.push(d);};add(name);if(!safe)continue;
  const body=prefix+'\nconst $$=$.peekCtx();\n'+ordered.map(n=>'const '+source.slice(n.start-1,n.end-1)+';').join('\n');
  const sliced=new Function('return async $=>{'+body+'}')();sliced._pineVersion=fn._pineVersion;result.set(name,sliced);
 }
 return result;
}
