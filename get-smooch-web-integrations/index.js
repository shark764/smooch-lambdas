/**
 * Lambda that gets a web integration from Smooch
 */

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const log = require('serenova-js-utils/lambda/log');
const { validateTenantPermissions } = require('serenova-js-utils/lambda/api');

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid().required(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});
AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const lambdaPermissions = ['WEB_INTEGRATIONS_APP_READ'];

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT } = process.env;
  const { params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'] };

  log.info('get-smooch-web-integrations was called', { ...logContext, params });
  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    log.warn('Error: invalid params value ', logContext, error);

    return {
      status: 400,
      body: { message: `Error: invalid params value ${error.details[0].message}` },
    };
  }

  const { 'tenant-id': tenantId } = params;

  const validPermissions = validateTenantPermissions(tenantId, identity, lambdaPermissions);

  if (!validPermissions) {
    const errMsg = 'Error not enough permissions';

    log.warn(errMsg, logContext);

    return {
      status: 400,
      body: { message: errMsg },
    };
  }

  const queryParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    KeyConditionExpression: '#tenantId = :t and #integrationType = :type',
    IndexName: 'tenant-id-type-index',
    ExpressionAttributeNames: {
      '#tenantId': 'tenant-id',
      '#integrationType': 'type',
    },
    ExpressionAttributeValues: {
      ':t': tenantId,
      ':type': 'web',
    },
  };
  let smoochIntegrations;

  try {
    const queryResponse = await docClient.query(queryParams).promise();
    smoochIntegrations = queryResponse.Items;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch integrations in DynamoDB';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  // Remove `type` from records
  smoochIntegrations = smoochIntegrations.map(({ type, ...otherAttrs }) => otherAttrs);

  log.info('get-smooch-web-integrations complete', logContext);

  return {
    status: 200,
    body: { result: smoochIntegrations },
  };
};
