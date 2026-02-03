import { APIGatewayProxyResult } from 'aws-lambda'

export const createResponse = (
  statusCode: number,
  body: any
): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  }
}

export const successResponse = (
  data: any,
  statusCode: number = 200
): APIGatewayProxyResult => {
  return createResponse(statusCode, data)
}

export const errorResponse = (
  message: string,
  statusCode: number = 400,
  additionalData?: Record<string, any>
): APIGatewayProxyResult => {
  const body: any = { error: message, statusCode }
  if (additionalData) {
    Object.assign(body, additionalData)
  }
  return createResponse(statusCode, body)
}
