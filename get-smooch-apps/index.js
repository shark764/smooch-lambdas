/**
 * Lambda that gets the apps from Smooch
 * */

const AWS = require('aws-sdk');
const Joi = require('joi');
const {
  lambda: {
    log,
    api: { validateTenantPermissions, validatePlatformPermissions },
  },
} = require('alonzo');

const docClient = new AWS.DynamoDB.DocumentClient();

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

const { REGION_PREFIX, ENVIRONMENT } = process.env;
const lambdaPermissions = ['DIGITAL_CHANNELS_APP_READ'];
const lambdaPlatformPermissions = ['PLATFORM_DIGITAL_CHANNELS_APP', 'PLATFORM_VIEW_ALL'];

exports.handler = async (event) => {
  const { params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'] };

  log.info('get-smooch-apps was called', { ...logContext, params });

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
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
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
