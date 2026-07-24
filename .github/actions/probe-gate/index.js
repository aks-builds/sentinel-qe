const fs = require('node:fs')
const { evaluateThresholds, buildCommentBody } = require('./lib')

const ENDPOINT = process.env['INPUT_ENDPOINT']
const API_KEY = process.env['INPUT_API-KEY']
const SUITE_NAME = process.env['INPUT_SUITE']
const MODE = process.env['INPUT_MODE']
const RUN_ID = process.env['INPUT_RUN-ID']
const MAX_DURATION_SECONDS = Number(process.env['INPUT_MAX-DURATION-SECONDS'] ?? '300')

function setOutput(name, value) {
  const outputFile = process.env['GITHUB_OUTPUT']
  if (outputFile) fs.appendFileSync(outputFile, `${name}=${value}\n`)
}

async function findSuiteIdByName(name) {
  const response = await fetch(`${ENDPOINT}/api/probe/suites`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  if (!response.ok) throw new Error(`Failed to list suites: ${response.status}`)
  const { suites } = await response.json()
  const match = suites.find((suite) => suite.name === name)
  if (!match) throw new Error(`No suite named "${name}" found`)
  return match.id
}

async function startRun() {
  const suiteId = await findSuiteIdByName(SUITE_NAME)
  const response = await fetch(`${ENDPOINT}/api/probe/suites/${suiteId}/runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  if (!response.ok) throw new Error(`Failed to start run: ${response.status}`)
  const { run } = await response.json()
  setOutput('run-id', run.id)
  console.log(`Started run ${run.id} for suite "${SUITE_NAME}"`)
}

async function postPrComment(body) {
  const eventPath = process.env['GITHUB_EVENT_PATH']
  const repository = process.env['GITHUB_REPOSITORY']
  const token = process.env['GITHUB_TOKEN']
  if (!eventPath || !repository || !token) {
    console.log('Not running with a GITHUB_TOKEN/event context -- skipping PR comment.')
    return
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
  const issueNumber = event.pull_request?.number
  if (!issueNumber) {
    console.log('Not a pull_request event -- skipping PR comment.')
    return
  }
  const response = await fetch(`https://api.github.com/repos/${repository}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) console.log(`Failed to post PR comment: ${response.status}`)
}

async function checkRun() {
  await fetch(`${ENDPOINT}/api/probe/runs/${RUN_ID}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  const response = await fetch(`${ENDPOINT}/api/probe/runs/${RUN_ID}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  if (!response.ok) throw new Error(`Failed to fetch run: ${response.status}`)
  const { run } = await response.json()

  const evaluation = evaluateThresholds(run, MAX_DURATION_SECONDS)
  await postPrComment(buildCommentBody(run, evaluation))
  setOutput('passed', evaluation.passed)

  if (!evaluation.passed) {
    console.error(evaluation.reasons.join('; '))
    process.exitCode = 1
  } else {
    console.log(`Run ${run.id} passed in ${evaluation.durationSeconds.toFixed(1)}s`)
  }
}

async function main() {
  if (MODE === 'start') {
    await startRun()
  } else if (MODE === 'check') {
    await checkRun()
  } else {
    throw new Error(`Unknown mode "${MODE}" -- expected "start" or "check"`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
