// @vitest-environment node
import { describe, expect, it } from 'vitest'
import handler, { config } from './health.mts'

describe('health function', () => {
  it('returns the expected public health JSON', async () => {
    const response = await handler()

    await expect(response.json()).resolves.toEqual({ status: 'ok' })
    expect(response.status).toBe(200)
  })

  it('is configured for the public GET /api/health path', () => {
    expect(config.method).toEqual(['GET'])
    expect(config.path).toBe('/api/health')
  })
})
