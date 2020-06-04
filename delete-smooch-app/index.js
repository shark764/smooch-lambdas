/**
 * Lambda that deletes a smooch app
 * */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();
const Joi = require('@hapi/joi');
const {
  lambda: {
    log,
    api: { validatePlatformPermissions },
  },
} = require('alonzo');

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid().required(),
  id: Joi.string().required(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});
const lambdaPermissions = ['PLATFORM_DIGITAL_CHANNELS_APP'];

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT, smooch_api_url: smoochApiUrl } = process.env;
  const { params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'] };

  log.info('delete-smooch-app was called', { ...logContext, params, smoochApiUrl });

  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    log.warn('Error: invalid params value', { ...logContext, validationMessage: error.details[0].message });

    return {
      status: 400,
      body: { message: `Error: invalid params value ${error.details[0].message}` },
    };
  }

  const { 'tenant-id': tenantId, id: appId } = params;
  const validPermissions = validatePlatformPermissions(identity, lambdaPermissions);

  if (!validPermissions) {
    const errMsg = 'Error not enough permissions';

    log.warn(errMsg, logContext);

    return {
      status: 400,
      body: { message: errMsg },
    };
  }
  let accountSecrets;

  logContext.smoochAppId = appId;
  try {
    accountSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-account`,
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
      serviceUrl: smoochApiUrl,
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

  const deleteParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
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

  const appSecretName = `${AWS_REGION}-${ENVIRONMENT}-smooch-app`;
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
