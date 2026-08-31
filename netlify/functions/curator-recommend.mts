import type { Config } from '@netlify/functions'
import { handleCuratorRecommend } from './_shared/curator-handlers.mts'

export default async function handler(request: Request): Promise<Response> {
  return handleCuratorRecommend(request)
}

export const config: Config = {
  method: ['POST'],
  path: '/api/curator/recommend',
}
