/**
 * Lambda that gets the apps from Smooch
 * */

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const log = require('serenova-js-utils/lambda/log');
const { validateTenantPermissions, validatePlatformPermissions } = require('serenova-js-utils/lambda/api');

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});
AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const lambdaPermissions = ['DIGITAL_CHANNELS_APP_READ'];
const lambdaPlatformPermissions = ['PLATFORM_DIGITAL_CHANNELS_APP'];

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT, smooch_api_url: smoochApiUrl } = process.env;
  const { params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'] };

  log.info('get-smooch-apps was called', { ...logContext, params, smoochApiUrl });

  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    log.warn('Error: invalid params value', { ...logContext, validationMessage: error.details[0].message }, error);

    return {
      status: 400,
      body: { message: `Error: invalid params value ${error.details[0].message}`, error },
    };
  }

  const { 'tenant-id': tenantId } = params;

  const validPermissions = validateTenantPermissions(tenantId, identity, lambdaPermissions);
  const validPlatformPermissions = validatePlatformPermissions(identity, lambdaPlatformPermissions);

  if (!(validPermissions || validPlatformPermissions)) {
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
      ':type': 'app',
    },
  };

  let smoochApps;

  try {
    const queryResponse = await docClient.query(queryParams).promise();
    smoochApps = queryResponse.Items;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch apps in DynamoDB';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  log.info('get-smooch-apps complete', { ...logContext, smoochApps });

  return {
    status: 200,
    body: { result: smoochApps },
  };
};
