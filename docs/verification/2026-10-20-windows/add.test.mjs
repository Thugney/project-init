import {test} from 'node:test';
import assert from 'node:assert/strict';
import {add} from '../src/add.mjs';
test('positive',()=>assert.equal(add(2,3),5));
test('negative',()=>assert.equal(add(-2,-3),-5));
test('zero',()=>assert.equal(add(0,0),0));
