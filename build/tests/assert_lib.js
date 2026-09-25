// All tests run against the ISOLATED test database (never the live 'cryptonews' DB).
const _fs = require('fs'), _path = require('path');
process.env.DATABASE_URL = _fs.readFileSync(_path.join(__dirname, '.test_db_url'), 'utf8').trim();
if (!/\/cryptonews_test\?/.test(process.env.DATABASE_URL)) { console.error('REFUSING: test DATABASE_URL is not cryptonews_test'); process.exit(3); }
// Tiny assertion harness: every check counts; process exits 1 if anything fails.
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : ''); }
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}
function done(label) {
  console.log(`${label}: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
module.exports = { check, eq, done };
