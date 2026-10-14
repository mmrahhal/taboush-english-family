const fs = require('node:fs');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const projectId = 'demo-taboush';
const parentUid = process.env.PARENT_UID;
const linkedUid = 'test-linked-student';
const otherUid = 'test-unlinked-student';
if (!parentUid) {
  console.error('Missing PARENT_UID. In CMD, run: set "PARENT_UID=your-real-parent-uid"');
  process.exit(1);
}
const rules = fs.readFileSync('firestore.rules', 'utf8');
if (!rules.includes(parentUid) || !rules.includes('match /studentLinks/{studentId}')) {
  console.error('firestore.rules does not contain this PARENT_UID and V5 studentLinks rules.');
  process.exit(1);
}

async function run() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules },
  });
  let failures = 0;
  async function check(name, shouldAllow, action) {
    try {
      if (shouldAllow) await assertSucceeds(action());
      else await assertFails(action());
      console.log('PASS  ' + name);
    } catch (err) {
      failures++;
      console.error('FAIL  ' + name + ' -> ' + (err?.message || err));
    }
  }
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await db.doc(`families/${parentUid}`).set({ name: 'test family' });
      await db.doc(`families/${parentUid}/students/${linkedUid}`).set({ name: 'linked' });
      await db.doc(`families/${parentUid}/students/${otherUid}`).set({ name: 'other' });
      await db.doc(`studentLinks/${linkedUid}`).set({ parentUid, createdAt: Date.now() });
      await db.doc(`families/${parentUid}/students/${linkedUid}/notes/note1`).set({ text: 'Well done' });
      await db.doc(`families/${parentUid}/students/${linkedUid}/rewards/reward1`).set({ title: 'Reward' });
    });
    const parent = env.authenticatedContext(parentUid).firestore();
    const student = env.authenticatedContext(linkedUid).firestore();
    const other = env.authenticatedContext(otherUid).firestore();
    const anon = env.unauthenticatedContext().firestore();
    const base = `families/${parentUid}/students/${linkedUid}`;
    await check('Parent reads linked student', true, () => parent.doc(base).get());
    await check('Linked student reads own record', true, () => student.doc(base).get());
    await check('Linked student writes valid learning progress', true, () => student.doc(`${base}/learning/progress`).set({ xp: 10, done: {}, attempts: 1, correct: 1, history: [] }));
    await check('Linked student reads own progress', true, () => student.doc(`${base}/learning/progress`).get());
    await check('Linked student cannot edit parent note', false, () => student.doc(`${base}/notes/note1`).update({ text: 'altered' }));
    await check('Linked student cannot edit reward', false, () => student.doc(`${base}/rewards/reward1`).update({ title: 'altered' }));
    await check('Unlinked student cannot read linked student', false, () => other.doc(base).get());
    await check('Linked student cannot read sibling data', false, () => student.doc(`families/${parentUid}/students/${otherUid}`).get());
    await check('Anonymous user cannot read family', false, () => anon.doc(`families/${parentUid}`).get());
    await check('Student cannot create invalid progress', false, () => student.doc(`${base}/learning/progress`).set({ xp: -1, done: {}, attempts: 1, correct: 1, history: [] }));
    console.log(`\n${10 - failures}/10 tests passed`);
    if (failures) process.exitCode = 1;
  } finally {
    await env.cleanup();
  }
}
run().catch(err => { console.error(err); process.exitCode = 1; });
