import test from 'node:test';
import assert from 'node:assert/strict';
import { moscowClock, isCollectionDue } from '../lib/moscow-schedule.ts';

const daily={mode:'daily',days:[1,2,3,4,5,6,7],time_msk:'05:00',updated_at:0};
test('05:00 is evaluated in Moscow, including the UTC date boundary',()=>{
 const before=moscowClock(new Date('2026-09-24T01:59:00Z'));
 const at=moscowClock(new Date('2026-09-24T02:00:00Z'));
 assert.deepEqual(before,{date:'2026-09-24',day:4,time:'04:59'});
 assert.deepEqual(at,{date:'2026-09-24',day:4,time:'05:00'});
 assert.equal(isCollectionDue(daily,before),false);
 assert.equal(isCollectionDue(daily,at),true);
});
test('selected weekdays use the Moscow calendar day',()=>{
 const sundayUtc=moscowClock(new Date('2026-09-27T21:01:00Z'));
 assert.deepEqual(sundayUtc,{date:'2026-09-28',day:1,time:'00:01'});
 assert.equal(isCollectionDue({...daily,mode:'selected',days:[1],time_msk:'00:00'},sundayUtc),true);
 assert.equal(isCollectionDue({...daily,mode:'selected',days:[2],time_msk:'00:00'},sundayUtc),false);
});
