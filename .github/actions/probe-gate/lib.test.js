const test = require('node:test')
const assert = require('node:assert/strict')
const { evaluateThresholds, buildCommentBody } = require('./lib')

test('evaluateThresholds passes when the run finished within the duration limit', () => {
  const run = { id: 'run-1', startedAt: '2026-07-24T00:00:00.000Z', completedAt: '2026-07-24T00:01:00.000Z' }
  const result = evaluateThresholds(run, 300)
  assert.equal(result.passed, true)
  assert.equal(result.durationSeconds, 60)
  assert.deepEqual(result.reasons, [])
})

test('evaluateThresholds fails when the run exceeded the duration limit', () => {
  const run = { id: 'run-1', startedAt: '2026-07-24T00:00:00.000Z', completedAt: '2026-07-24T00:10:00.000Z' }
  const result = evaluateThresholds(run, 300)
  assert.equal(result.passed, false)
  assert.equal(result.reasons.length, 1)
  assert.match(result.reasons[0], /exceeding the 300s limit/)
})

test('buildCommentBody includes a passed header and no failures section when passing', () => {
  const run = { id: 'run-1' }
  const evaluation = { passed: true, durationSeconds: 12.3, reasons: [] }
  const body = buildCommentBody(run, evaluation)
  assert.match(body, /Passed/)
  assert.doesNotMatch(body, /Failures/)
})

test('buildCommentBody includes a failed header and lists reasons when failing', () => {
  const run = { id: 'run-1' }
  const evaluation = { passed: false, durationSeconds: 999, reasons: ['too slow'] }
  const body = buildCommentBody(run, evaluation)
  assert.match(body, /Failed/)
  assert.match(body, /too slow/)
})

test('buildCommentBody notes that hallucination-rate/cost/score are not yet enforced', () => {
  const body = buildCommentBody({ id: 'run-1' }, { passed: true, durationSeconds: 1, reasons: [] })
  assert.match(body, /not yet enforced/)
})
