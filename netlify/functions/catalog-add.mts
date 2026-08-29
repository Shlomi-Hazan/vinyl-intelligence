import type { Config } from '@netlify/functions'
import { handleCatalogAdd } from './_shared/catalog-handlers.mts'

export default async function handler(request: Request): Promise<Response> {
  return handleCatalogAdd(request)
}

export const config: Config = {
  method: ['POST'],
  path: '/api/catalog/add',
}
