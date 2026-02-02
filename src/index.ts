import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import serverless from 'serverless-http'
import app from './app'

/**
 * Lambda Handler
 * Wraps Express app with serverless-http adapter
 * Automatically converts API Gateway events to Express requests
 */
const handler = serverless(app)

export { handler }
