import type { Config } from '@netlify/functions'
import { handleCuratorRefine } from './_shared/curator-handlers.mts'

export default async function handler(request: Request): Promise<Response> {
  return handleCuratorRefine(request)
}

export const config: Config = {
  method: ['POST'],
  path: '/api/curator/refine',
}
