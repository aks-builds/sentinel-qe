export async function checkEngineHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.ENGINE_URL}/health`)
    return res.ok
  } catch {
    return false
  }
}
