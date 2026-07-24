function evaluateThresholds(run, maxDurationSeconds) {
  const startedAt = new Date(run.startedAt).getTime()
  const completedAt = new Date(run.completedAt).getTime()
  const durationSeconds = (completedAt - startedAt) / 1000
  const withinDuration = durationSeconds <= maxDurationSeconds
  return {
    passed: withinDuration,
    durationSeconds,
    reasons: withinDuration
      ? []
      : [`Run took ${durationSeconds.toFixed(1)}s, exceeding the ${maxDurationSeconds}s limit`],
  }
}

function buildCommentBody(run, evaluation) {
  const status = evaluation.passed ? '✅ Passed' : '❌ Failed'
  const lines = [
    `## Sentinel Probe Gate — ${status}`,
    '',
    `**Run:** \`${run.id}\` completed in ${evaluation.durationSeconds.toFixed(1)}s`,
  ]
  if (evaluation.reasons.length > 0) {
    lines.push('', '**Failures:**', ...evaluation.reasons.map((reason) => `- ${reason}`))
  }
  lines.push(
    '',
    '_Note: `hallucination-rate`, `cost-usd`, and `score` thresholds are accepted but not yet enforced — Sentinel does not yet compute run-level scores._'
  )
  return lines.join('\n')
}

module.exports = { evaluateThresholds, buildCommentBody }
