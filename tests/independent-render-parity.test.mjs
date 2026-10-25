import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {directFixture} from './direct-source-fixture.mjs';
import {renderEditorialPost} from '../publishing/editorial.mjs';
import {REPOSITORY_SCOPE} from '../publishing/repository-scope.mjs';
// Expected hashes captured from unchanged origin main f1c381b before this migration.
// Synthetic technical fixtures; these are not approved editorial manuscripts.
const golden={'음식':'8eb11c1b07f7ab40f44f253ab45e68e0255533a7a946b447280586595b768adb','영양소':'15e0bd938cb59b9c358e08916bd70e3a0178d1a80b0d21d04871d63bdab67f19','약학':'8eb11c1b07f7ab40f44f253ab45e68e0255533a7a946b447280586595b768adb','질병':'8eb11c1b07f7ab40f44f253ab45e68e0255533a7a946b447280586595b768adb'};
test('renderer output matches the original runtime snapshot for the local category fixture',()=>{
 const source=directFixture({category:REPOSITORY_SCOPE.category});
 assert.equal(createHash('sha256').update(renderEditorialPost(source)).digest('hex'),golden[REPOSITORY_SCOPE.category]);
});
