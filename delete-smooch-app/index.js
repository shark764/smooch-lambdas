/**
 * Lambda that deletes a smooch app
 * */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const Joi = require('joi');
const {
  lambda: {
    log,
    api: { validatePlatformPermissions },
  },
} = require('alonzo');

const secretsClient = new AWS.SecretsManager();
const docClient = new AWS.DynamoDB.DocumentClient();

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid().required(),
  id: Joi.string().required(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

const { REGION_PREFIX, ENVIRONMENT, SMOOCH_API_URL } = process.env;
const lambdaPermissions = ['PLATFORM_DIGITAL_CHANNELS_APP'];

exports.handler = async (event) => {
  const { params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'] };

  log.info('delete-smooch-app was called', { ...logContext, params, SMOOCH_API_URL });

  /**
   * Validating permissions
   */

  const { 'tenant-id': tenantId, id: appId } = params;
  const validPermissions = validatePlatformPermissions(identity, lambdaPermissions);
  const expectedPermissions = {
    tenant: lambdaPermissions,
  };
  if (!validPermissions) {
    const errMsg = 'Error not enough permissions';

    log.warn(errMsg, { ...logContext, expectedPermissions });

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
    log.warn('Error: invalid params value', { ...logContext, validationMessage: error.details[0].message });

    return {
      status: 400,
      body: { message: `Error: invalid params value ${error.details[0].message}` },
    };
  }

  /**
   * Getting apps keys from secret manager
   */

  let accountSecrets;

  logContext.smoochAppId = appId;
  try {
    accountSecrets = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-account`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  let smooch;

  try {
    const accountKeys = JSON.parse(accountSecrets.SecretString);
    smooch = new SmoochCore({
      keyId: accountKeys.id,
      secret: accountKeys.secret,
      scope: 'account',
      serviceUrl: SMOOCH_API_URL,
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to validate digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  try {
    const { integrations } = await smooch.integrations.list({ appId });

    if (integrations.length > 0) {
      const errMsg = 'Integrations found for this app';

      log.warn(errMsg, { ...logContext, smoochIntegrations: integrations });

      return {
        status: 400,
        body: { message: errMsg },
      };
    }
  } catch (error) {
    const errMsg = 'An error occured trying to retrieve integrations';

    log.error(errMsg, logContext, error);

    return {
      status: 400,
      body: { message: errMsg },
    };
  }

  /**
   * Deleting apps records from dynamo
   */

  const deleteParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
    Key: {
      'tenant-id': tenantId,
      id: appId,
    },
  };

  try {
    await docClient.delete(deleteParams).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete a record in DynamoDB';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg, deleted: false },
    };
  }

  try {
    await smooch.apps.delete(appId);
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete an app';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const appSecretName = `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`;
  try {
    const appSecrets = await secretsClient.getSecretValue({
      SecretId: appSecretName,
    }).promise();

    const appKeys = JSON.parse(appSecrets.SecretString);

    if (appKeys[`${appId}-id`]) {
      delete appKeys[`${appId}-id`];
      delete appKeys[`${appId}-id-old`];
      if (appKeys[`${appId}-secret-old`]) delete appKeys[`${appId}-secret-old`];
      if (appKeys[`${appId}-secret`]) delete appKeys[`${appId}-secret`];

      await secretsClient.putSecretValue({
        SecretId: appSecretName,
        SecretString: JSON.stringify(appKeys),
      }).promise();
    }
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete app keys';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  log.info('user deleted a smooch app', {
    userId: identity['user-id'],
    tenantId,
    smoochAppId: appId,
    audit: true,
  });
  log.info('delete-smooch-app complete', logContext);

  return {
    status: 200,
    body: { message: `The app with for tenant ${tenantId} and appId ${appId} has been deleted successfully`, deleted: true },
  };
};
