const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const {
  lambda: {
    log,
    api: { validateTenantPermissions, validatePlatformPermissions },
  },
} = require('alonzo');
const string = require('serenova-js-utils/strings');

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();

const lambdaPermissions = [
  'DIGITAL_CHANNELS_APP_READ',
  'WEB_INTEGRATIONS_APP_UPDATE',
];
const lambdaPlatformPermissions = ['PLATFORM_DIGITAL_CHANNELS_APP'];

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT, smooch_api_url: smoochApiUrl } = process.env;
  const { params, identity } = event;

  const { 'tenant-id': tenantId } = params;
  const logContext = {
    tenantId,
    smoochUserId: identity['user-id'],
  };

  log.info('get-whatsapp-integrations was called', {
    ...logContext,
    params,
    smoochApiUrl,
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
    const errMsg = 'Error not enough permissions';
    log.warn(errMsg, logContext);

    return {
      status: 403,
      body: { message: errMsg },
    };
  }

  /**
   * Validating parameters
   */
  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    log.warn(
      'Error: invalid params value',
      { ...logContext, validationMessage: error.details[0].message },
      error,
    );

    return {
      status: 400,
      body: {
        message: `Error: invalid params value ${error.details[0].message}`,
        error,
      },
    };
  }

  /**
   * Getting apps records from dynamo
   */
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

  const result = integrations.map((integration) => {
    const integrationCased = {};
    Object.keys(integration).forEach((v) => {
      integrationCased[string.kebabCaseToCamelCase(v)] = integration[v];
    });
    return integrationCased;
  });

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
