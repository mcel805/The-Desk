// SPDX-License-Identifier: AGPL-3.0-only
import {parse} from 'acorn';
import {simple,ancestor} from 'acorn-walk';
import {generate} from 'astring';
// Pine request expressions belong to the requested context. Do not execute
// their stateful functions in the chart context merely to discover a call ID.
export function lazyRequests(fn){
 const ast=parse('('+fn.toString()+')',{ecmaVersion:'latest'}),decls=new Map(),expressions=new Set();
 // The compiler misses dual-use time helpers in tuple return branches.
 simple(ast,{CallExpression(n){if(n.callee.type==='MemberExpression'&&n.callee.object.name==='$'&&n.callee.property.name==='get'&&n.arguments[0]?.type==='Identifier'&&['time','time_close'].includes(n.arguments[0].name)){n.arguments[0]={type:'MemberExpression',computed:false,object:n.arguments[0],property:{type:'Identifier',name:'__value'}};}}});
 simple(ast,{CallExpression(n){if(n.callee.type==='MemberExpression'&&n.callee.object.name==='$'&&n.callee.property.name==='get'&&n.arguments[0]?.type==='Identifier'&&n.arguments[0].name==='undefined'&&n.arguments[1]?.type==='Literal'&&n.arguments[1].value===0){for(const k of Object.keys(n))delete n[k];Object.assign(n,{type:'Identifier',name:'undefined'});}}});
 ancestor(ast,{Identifier(node,parents){const enclosing=parents.slice(0,-1).reverse().find(n=>n.type==='FunctionDeclaration');if(!enclosing)return;const p=enclosing.params.find(p=>p.type==='Identifier'&&p.name.match(/^(.+)_\$\d+$/)?.[1]===node.name);if(p)node.name=p.name;}});
 simple(ast,{VariableDeclarator(n){if(n.id.type==='Identifier')decls.set(n.id.name,n);},CallExpression(n){if(n.callee.type==='MemberExpression'&&n.callee.object.name==='request'&&n.callee.property.name==='security'&&n.arguments[2]?.type==='Identifier')expressions.add(n.arguments[2].name);}});
 for(const name of expressions){const d=decls.get(name),call=d?.init;if(call?.type!=='CallExpression'||call.callee.object?.name!=='request'||call.callee.property?.name!=='param')throw Error('Unsupported security expression shape.');call.callee.property.name='paramThunk';call.arguments[0]={type:'ArrowFunctionExpression',async:true,expression:true,params:[],body:call.arguments[0]};d.init={type:'AwaitExpression',argument:call};}
 const rewritten=new Function('return '+generate(ast.body[0].expression))();rewritten._pineVersion=fn._pineVersion;rewritten._deskLazy=true;return rewritten;
}
