import assert from 'node:assert/strict';
import { createBehaviorTasks } from '../prototype/src/behavior-tasks.js';
import { createSeatLeases } from '../prototype/src/seat-lease.js';
const outcomes = [];
function check(name, fn) { fn(); outcomes.push(name); }
check('admission separated from execution; stable IDs and immutable snapshots', () => {
 const t=createBehaviorTasks({ownerId:'a'}),first=t.request({requestId:'a:1',kind:'walk',payload:{z:2,x:1}});
 assert.equal(first.admission,'accepted');assert.equal(first.task.state,'running');
 first.task.payload.x=7;assert.equal(t.get('a:1').payload.x,1);
 assert.equal(t.request({requestId:'a:1',kind:'walk',payload:{x:1,z:2}}).duplicate,true);
 assert.equal(t.request({requestId:'a:1',kind:'sit'}).reason,'request-id-conflict');
 const queued=t.request({kind:'sit'});assert.equal(queued.task.requestId,'a:2');assert.equal(queued.admission,'queued');assert.equal(queued.task.state,'pending');
 assert.equal(t.request({requestId:'reject',kind:'dance',queue:false}).admission,'rejected');
 assert.equal(t.get('reject').state,null);assert.equal(t.complete(queued.task.requestId),false);
 assert.equal(t.complete('a:1',{arrived:true}),true);assert.equal(t.active(),null);
 assert.equal(t.startNext().requestId,'a:2');assert.equal(t.get('a:2').admission,'queued');
 assert.equal(t.request({requestId:'reject',kind:'dance',queue:false}).admission,'rejected');
});
check('terminal exactly once, including reentrant listeners and callback errors',()=>{
 let t;t=createBehaviorTasks({onEvent:e=>{if(e.type==='completed'){t.complete(e.task.requestId);t.cancel(e.task.requestId);throw Error('consumer error');}}});
 t.request({requestId:'one',kind:'idle'});t.complete('one');t.fail('one');t.dispose();
 assert.equal(t.history().filter(e=>['completed','cancelled','failed'].includes(e.type)).length,1);
 assert.equal(t.diagnostics().listenerErrors.length,1);
 let r;r=createBehaviorTasks({onEvent:e=>{if(e.type==='accepted')r.cancel(e.task.requestId,'immediate supersede');}});
 assert.equal(r.request({requestId:'r',kind:'walk'}).task.state,'cancelled');assert.equal(r.active(),null);
});
check('only simulation seconds advance timeout; queue wait included',()=>{
 const t=createBehaviorTasks();t.request({requestId:'walk',kind:'walk',timeoutSeconds:2});t.request({requestId:'sit',kind:'sit',timeoutSeconds:1});
 t.tick(0);assert.equal(t.get('sit').state,'pending');t.tick(.99);assert.equal(t.get('sit').state,'pending');t.tick(.01);
 assert.equal(t.get('sit').state,'failed');assert.equal(t.get('sit').reason,'timeout');assert.equal(t.active().requestId,'walk');
 t.tick(1);assert.equal(t.get('walk').state,'failed');assert.equal(t.startNext(),null);
 assert.throws(()=>t.tick(-1));assert.throws(()=>t.tick(NaN));assert.throws(()=>t.request({kind:'bad',timeoutSeconds:Infinity}));
 const circular={};circular.self=circular;assert.throws(()=>t.request({kind:'bad',payload:circular}));
});
check('dispose cancels every admitted pending/running task once',()=>{
 const t=createBehaviorTasks();t.request({requestId:'1',kind:'walk'});t.request({requestId:'2',kind:'sit'});t.dispose();t.dispose();
 assert.equal(t.history().filter(e=>e.type==='cancelled').length,2);assert.equal(t.request({kind:'idle'}).reason,'disposed');
});
check('seat unique ownership, owner cannot collect stale second leases',()=>{
 const s=createSeatLeases(),a=s.reserve({seatId:'chair',ownerId:'A',requestId:'a1'}),token=a.lease.token;
 assert.equal(s.reserve({seatId:'chair',ownerId:'A',requestId:'a1'}).lease.token,token);
 assert.equal(s.reserve({seatId:'other',ownerId:'A',requestId:'a1'}).reason,'request-id-conflict');
 assert.equal(s.reserve({seatId:'other',ownerId:'A',requestId:'a2'}).reason,'owner-already-has-seat');
 assert.equal(s.reserve({seatId:'chair',ownerId:'B',requestId:'b1'}).reason,'seat-unavailable');
 assert.equal(s.requestRelease(token,'approach-failed'),true);assert.equal(s.forSeat('chair'),null);
 // Replaying a rejected/completed reservation cannot silently acquire a later seat.
 assert.equal(s.reserve({seatId:'chair',ownerId:'B',requestId:'b1'}).accepted,false);
 assert.equal(s.reserve({seatId:'chair',ownerId:'A',requestId:'a1'}).reason,'request-already-released');
 assert.equal(s.reserve({seatId:'chair',ownerId:'B',requestId:'b2'}).accepted,true);
});
check('sit task completes while chair stays occupied; cancellation/failure needs exit',()=>{
 const t=createBehaviorTasks({ownerId:'A'}),s=createSeatLeases();t.request({requestId:'sit',kind:'sit'});
 const token=s.reserve({seatId:'chair',ownerId:'A',requestId:'sit'}).lease.token;
 s.occupy(token);t.complete('sit');assert.equal(s.forSeat('chair').state,'occupied');
 assert.equal(s.releaseAfterExit(token),false);s.requestRelease(token,'followup-failed');assert.equal(s.forSeat('chair').state,'occupied');
 assert.equal(s.reserve({seatId:'chair',ownerId:'B',requestId:'b1'}).accepted,false);
 s.beginExit(token);assert.equal(s.forSeat('chair').state,'exiting');s.releaseAfterExit(token);assert.equal(s.forSeat('chair'),null);
 assert.equal(s.releaseAfterExit(token),false);assert.equal(s.history().filter(e=>e.type==='released').length,1);
});
check('destroyed owner releases reserved or occupied seat, never another owner',()=>{
 const s=createSeatLeases(),a=s.reserve({seatId:'1',ownerId:'A',requestId:'1'}),b=s.reserve({seatId:'2',ownerId:'B',requestId:'1'});
 s.occupy(a.lease.token);assert.equal(s.disposeOwner('A'),1);assert.equal(s.disposeOwner('A'),0);assert.equal(s.forSeat('1'),null);assert.equal(s.forSeat('2').token,b.lease.token);
});
console.log(JSON.stringify({passed:outcomes.length,checks:outcomes,limitations:['Pure lifecycle/lease checks; no room-controller integration or physical seated detection validated']},null,2));
