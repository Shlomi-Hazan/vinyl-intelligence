import type { Config } from '@netlify/functions'
import { handleCatalogSearch } from './_shared/catalog-handlers.mts'

export default async function handler(request: Request): Promise<Response> {
  return handleCatalogSearch(request)
}

export const config: Config = {
  method: ['GET'],
  path: '/api/catalog/search',
}
