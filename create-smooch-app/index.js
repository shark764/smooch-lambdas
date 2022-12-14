/**
 * Lambda that creates a new smooch app
 */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const Joi = require('joi');
const axios = require('axios');
const {
  lambda: {
    log,
    api: { validatePlatformPermissions },
  },
} = require('alonzo');

const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

const bodySchema = Joi.object({
  name: Joi.string().required(),
  conversationRetentionSeconds: Joi.number(),
});

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

const {
  REGION_PREFIX,
  ENVIRONMENT,
  DOMAIN,
  SMOOCH_API_URL,
} = process.env;
const lambdaPermissions = ['PLATFORM_DIGITAL_CHANNELS_APP'];
const DEFAULT_CONVERSATION_RETENTION_SECONDS = 3600 * 48;

exports.handler = async (event) => {
  const { params, body, identity } = event;
  const logContext = { tenantId: params['tenant-id'], userId: identity['user-id'] };

  log.info('create-smooch-app was called', { ...logContext, params, SMOOCH_API_URL });

  /**
   * Validating permissions
   */

  const { 'tenant-id': tenantId, auth } = params;
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

  const apiUrl = `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}`;
  try {
    const response = await axios({
      method: 'get',
      url: apiUrl,
      headers: {
        Authorization: auth,
      },
    });
    if (!(response && response.data && response.data.result && response.data.result.active)) {
      const errMsg = 'Error tenant not found or inactive';

      log.warn(errMsg, logContext);

      return {
        status: 400,
        body: { message: errMsg },
      };
    }
  } catch (error) {
    if (error.response.status === 404) {
      log.warn('Tenant not found', logContext);
      return {
        status: 400,
        body: { message: `Tenant ${tenantId} not found` },
      };
    }
    log.error('Unexpected error occurred retrieving tenant', logContext, error);
    return {
      status: 500,
      body: `Unexpected error occurred retrieving tenant ${tenantId}`,
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

  try {
    await bodySchema.validateAsync(body, { abortEarly: false });
  } catch (error) {
    const errMsg = 'Error: invalid body value(s).';
    const validationMessage = error.details
      .map(({ message }) => message)
      .join(' / ');

    log.warn(errMsg, { ...logContext, validationMessage }, error);

    return {
      status: 400,
      body: {
        message: `${errMsg} ${validationMessage}`,
      },
    };
  }

  /**
   * Getting account keys from secret manager
   */

  let accountSecrets;
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
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  /**
   * Creating smooch integration
   */

  let newApp;
  try {
    newApp = await smooch.apps.create({
      name: body.name,
      settings: {
        conversationRetentionSeconds: body.conversationRetentionSeconds
        || DEFAULT_CONVERSATION_RETENTION_SECONDS,
      },
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create an App';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const newAppId = newApp.app._id;
  let smoochAppKeys;

  logContext.smoochAppId = newAppId;

  try {
    smoochAppKeys = await smooch.apps.keys.create(newAppId, newAppId);
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create App credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  /**
   * Getting apps keys from secret manager
   */

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred (1) trying to save App credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const appKeys = JSON.parse(appSecrets.SecretString);
  appKeys[`${newAppId}-id`] = smoochAppKeys.key._id;
  appKeys[`${newAppId}-secret`] = smoochAppKeys.key.secret;

  try {
    await secretsClient.putSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
      SecretString: JSON.stringify(appKeys),
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred (2) trying to save App credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const webhookUrl = `https://${REGION_PREFIX}-${ENVIRONMENT}-smooch-gateway.${DOMAIN}/webhook?tenantId=${tenantId}`;
  let webhook;
  try {
    webhook = await smooch.webhooks.create(newAppId, { target: webhookUrl, triggers: ['message:appUser', 'conversation:read', 'typing:appUser', 'message:delivery:failure', 'postback'], includeClient: true });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create webhooks';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const smoochParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
    Item: {
      'tenant-id': tenantId,
      id: newAppId,
      name: body.name,
      type: 'app',
      'webhook-id': webhook.webhook._id,
      'created-by': identity['user-id'],
      'updated-by': identity['user-id'],
      created: (new Date()).toISOString(),
      updated: (new Date()).toISOString(),
    },
  };

  /**
   * Setting apps records in dynamo
   */

  try {
    await docClient.put(smoochParams).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to save a record in DynamoDB';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  log.info('user created a new smooch app', {
    userId: identity['user-id'],
    tenantId,
    smoochAppId: newAppId,
    auditData: Object.keys(body),
    audit: true,
  });
  log.info('create-smooch-app complete', { ...logContext, webhook, app: newApp });

  return {
    status: 200,
    body: {
      app: newApp.app,
      webhook: webhook.webhook,
    },
  };
};
