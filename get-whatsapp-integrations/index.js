const AWS = require('aws-sdk');
const Joi = require('joi');
const string = require('serenova-js-utils/strings');
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
const lambdaPermissions = ['WHATSAPP_INTEGRATIONS_APP_READ'];
const lambdaPlatformPermissions = ['PLATFORM_VIEW_ALL'];

exports.handler = async (event) => {
  const { params, identity } = event;

  const { 'tenant-id': tenantId } = params;
  const logContext = {
    tenantId,
    smoochUserId: identity['user-id'],
  };

  log.info('get-whatsapp-integrations was called', {
    ...logContext,
    params,
  });

  /**
   * Validating permissions
   */
  const validPermissions = validateTenantPermissions(
    tenantId,
    identity,
    lambdaPermissions,
  );
  const validPlatformPermissions = validatePlatformPermissions(
    identity,
    lambdaPlatformPermissions,
  );

  if (!(validPermissions || validPlatformPermissions)) {
    const expectedPermissions = {
      tenant: lambdaPermissions,
      platform: lambdaPlatformPermissions,
    };
    const errMsg = 'Error not enough permissions';
    log.warn(errMsg, logContext, expectedPermissions);

    return {
      status: 403,
      body: { message: errMsg, expectedPermissions },
    };
  }

  /**
   * Validating parameters
   */
  try {
    await paramsSchema.validateAsync(params, { abortEarly: false });
  } catch (error) {
    const errMsg = 'Error: invalid params value(s).';
    const validationMessage = error.details
      .map(({ message }) => message)
      .join(' / ');

    log.warn(errMsg, { ...logContext, validationMessage }, error);

    return {
      status: 400,
      body: {
        message: `${errMsg} ${validationMessage}`,
        error,
      },
    };
  }

  /**
   * Getting apps records from dynamo
   */
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
      ':type': 'whatsapp',
    },
  };

  let integrations;
  try {
    const queryResponse = await docClient.query(queryParams).promise();
    integrations = queryResponse.Items;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch integrations in DynamoDB';

    log.error(errMsg, logContext, error, queryParams);

    return {
      status: 500,
      body: { message: errMsg, queryParams },
    };
  }

  const result = string.keysToCamelCase(integrations);

  log.info('get-whatsapp-integrations complete', {
    ...logContext,
    integrations: result,
  });

  return {
    status: 200,
    body: {
      result,
    },
  };
};
