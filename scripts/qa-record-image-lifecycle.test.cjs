const assert = require('node:assert/strict');
const test = require('node:test');
const {collectRuns} = require('./qa-record-image-lifecycle.cjs');

function complete(row) {
  const actor = id => ({images:[{id}]});
  row.phases = [
    ['opening',1,[1,2]], ['remove-first',2,[2]], ['empty',3,[]],
    ['restore-both',4,[3,4]], ['remove-second-first',5,[3]], ['final-empty',6,[]],
  ].map(([phase,time,ids])=>({phase,time,actors:ids.map(actor)}));
  const closeTimes = [1.5,2.5,5.5,4.5];
  row.trace = {hooks:{createImageBitmap:true,imageBitmapClose:true}, droppedEvents:0, counts:{'bitmap-error':0},
    events:closeTimes.flatMap((atMs,i)=>[
      {type:'bitmap-end',atMs:i<2?.5:3.5,imageId:i+1}, {type:'bitmap-close',atMs,imageId:i+1,closeCount:1},
    ])};
  row.uploadChecks = ['remove-first','remove-second-first'].map(phase=>({phase,status:'verified'}));
}

test('pixel failures in both removal orders preserve both full ownership traces and remain nonzero',async()=>{
  const result={runs:[]};
  await assert.rejects(collectRuns(result,row=>{
    complete(row);
    const i=result.runs.length-1;
    Object.assign(row.uploadChecks[i],{status:'failed',failure:`retained pixel failure ${i+1}`});
  },true), /Browser process 1: remove-first: retained pixel failure 1\nBrowser process 2: remove-second-first: retained pixel failure 2/);
  assert.equal(result.pixelStatus,'failed');
  assert.equal(result.releaseStatus,'verified');
  assert.equal(result.runs.length,2);
  for(const row of result.runs){
    assert.equal(row.uploadChecks.length,2);
    assert.deepEqual(row.release,{decoded:4,closedExactlyOnce:4,phases:6});
  }
});

test('missing closes fail independently of verified pixels',async()=>{
  const result={runs:[]};
  await assert.rejects(collectRuns(result,row=>{
    complete(row);
    if(result.runs.length===1) row.trace.events.splice(1,1);
  },true), /Wrong image release set at remove-first/);
  assert.deepEqual(result.runs.map(row=>row.releaseStatus),['failed','verified']);
  assert.equal(result.releaseStatus,'failed');
  assert.equal(result.pixelStatus,'verified');
});

test('a failed first browser still records the second and never claims an unobserved gate',async()=>{
  const result={runs:[]};
  await assert.rejects(collectRuns(result,row=>{
    if(result.runs.length===1) throw Error('Browser unavailable');
    complete(row);
  },true), /Browser unavailable/);
  assert.deepEqual(result.runs.map(row=>[row.releaseStatus,row.pixelStatus]),[['unobserved','unobserved'],['verified','verified']]);
  assert.equal(result.releaseStatus,'unobserved');
  assert.equal(result.pixelStatus,'unobserved');
});
