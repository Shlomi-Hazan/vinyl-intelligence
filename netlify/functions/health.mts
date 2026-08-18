import type { Config } from '@netlify/functions'

export default async function handler(): Promise<Response> {
  return Response.json(
    { status: 'ok' },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

export const config: Config = {
  method: ['GET'],
  path: '/api/health',
}
