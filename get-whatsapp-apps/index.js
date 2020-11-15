/**
 * Lambda that gets the whatsapp apps from Smooch
 */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const {
  lambda: {
    log,
    api: { validateTenantPermissions, validatePlatformPermissions },
  },
} = require('alonzo');

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

const lambdaPermissions = ['DIGITAL_CHANNELS_APP_READ'];
const lambdaPlatformPermissions = ['PLATFORM_DIGITAL_CHANNELS_APP'];

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT, smooch_api_url: smoochApiUrl } = process.env;
  const { params, identity } = event;
  const logContext = {
    tenantId: params['tenant-id'],
    smoochUserId: identity['user-id'],
  };

  log.info('get-whatsapp-apps was called', {
    ...logContext,
    params,
    smoochApiUrl,
  });

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

  const { 'tenant-id': tenantId } = params;

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
   * Getting app secrets
   */
  let appSecrets;
  try {
    appSecrets = await secretsClient
      .getSecretValue({
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
      })
      .promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
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
      ':type': 'app',
    },
  };

  let smoochAppDynamoRecords;
  try {
    const queryResponse = await docClient.query(queryParams).promise();
    smoochAppDynamoRecords = queryResponse.Items;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch apps in DynamoDB';

    log.error(errMsg, logContext, error, queryParams);

    return {
      status: 500,
      body: { message: errMsg, queryParams },
    };
  }

  /**
   * Getting apps from smooch
   */
  let smoochApps;
  try {
    smoochApps = await Promise.all(
      smoochAppDynamoRecords.map(({ id: appId }) => {
        const appKeys = JSON.parse(appSecrets.SecretString);
        const smooch = new SmoochCore({
          keyId: appKeys[`${appId}-id`],
          secret: appKeys[`${appId}-secret`],
          scope: 'app',
          serviceUrl: smoochApiUrl,
        });

        return smooch.integrations.list({
          appId,
          types: 'whatsapp',
        });
      }),
    );
  } catch (error) {
    const errMsg = 'An error occured trying to retrieve whatsapp integrations';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  /**
   * Getting integrations from every smooch app
   */
  const integrations = smoochApps.reduce(
    (appIntegrations, smoochApp, index) => [
      ...appIntegrations,
      ...smoochApp.integrations.map(({ _id, ...integration }) => ({
        ...integration,
        id: _id,
        appId: smoochAppDynamoRecords[index].id,
      })),
    ],
    [],
  );

  log.info('get-whatsapp-apps complete', {
    ...logContext,
    smoochAppDynamoRecords,
    smoochApps,
    integrations,
  });

  return {
    status: 200,
    body: {
      result: integrations,
    },
  };
};
