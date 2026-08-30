import type { Config } from '@netlify/functions'
import { handleCatalogRecognize } from './_shared/recognition-handlers.mts'

export default async function handler(request: Request): Promise<Response> {
  return handleCatalogRecognize(request)
}

export const config: Config = {
  method: ['POST'],
  path: '/api/catalog/recognize',
}
