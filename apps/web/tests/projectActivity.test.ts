import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectFrameScheduler } from '../src/app/projectActivity';
test('hidden frames stop, resume once, preserve pending callbacks and cancel disposed tools',()=>{
 const native=new Map<number,FrameRequestCallback>();let id=0,delivered=0;
 const scheduler=new ProjectFrameScheduler(cb=>{native.set(++id,cb);return id;},key=>{native.delete(key);});
 const loop=()=>{delivered++;scheduler.schedule(loop);};scheduler.schedule(loop);
 scheduler.setActive(false);assert.equal(native.size,0);assert.equal(scheduler.pending,1);
 const disposed=scheduler.schedule(()=>{throw Error('disposed tool resumed');});scheduler.remove(disposed);
 scheduler.setActive(true);scheduler.setActive(true);assert.equal(native.size,1);
 const [key,cb]=[...native][0];native.delete(key);cb(100);assert.equal(delivered,1);assert.equal(native.size,1);
 scheduler.setActive(false);assert.equal(native.size,0);assert.equal(scheduler.pending,1);
});
