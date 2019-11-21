/**
 * Lambda that creates a new smooch app
 */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const axios = require('axios');
const log = require('serenova-js-utils/lambda/log');

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

const bodySchema = Joi.object({
  name: Joi.string().required(),
});

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;
  const { params, body, identity } = event;
  const logContext = { tenantId: params['tenant-id'], userId: identity['user-id'] };

  log.info('create-smooch-app was called', logContext);

  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    log.error('Error: invalid params value', { ...logContext, validationMessage: error.details[0].message }, error);

    return {
      status: 400,
      body: { message: `Error: invalid params value ${error.details[0].message}` },
    };
  }

  try {
    await bodySchema.validateAsync(body);
  } catch (error) {
    const errMsg = 'Error: invalid body value';

    log.warn(errMsg, { ...logContext, validationMessage: error.details[0].message }, error);

    return {
      status: 400,
      body: { message: `${errMsg} ${error.details[0].message}` },
    };
  }

  const { 'tenant-id': tenantId, auth } = params;
  const apiUrl = `https://${ENVIRONMENT}-api.${DOMAIN}/v1/tenants/${tenantId}`;
  try {
    const response = await axios.get(apiUrl, { headers: { Authorization: auth } });
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

  let accountSecrets;
  try {
    accountSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/account`,
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
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  let newApp;
  try {
    newApp = await smooch.apps.create({ name: body.name });
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

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`,
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
      SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`,
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

  const webhookUrl = `https://${AWS_REGION}-${ENVIRONMENT}-smooch-gateway.${DOMAIN}/webhook?tenantId=${tenantId}`;
  let webhook;
  try {
    webhook = await smooch.webhooks.create(newAppId, { target: webhookUrl, triggers: ['message:appUser', 'conversation:read', 'typing:appUser'], includeClient: true });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create webhooks';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const smoochParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    Item: {
      'tenant-id': tenantId,
      id: newAppId,
      type: 'app',
      'webhook-id': webhook.webhook._id,
      'created-by': identity['user-id'],
      'updated-by': identity['user-id'],
      created: (new Date()).toISOString(),
      updated: (new Date()).toISOString(),
    },
  };

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

  log.info('create-smooch-app complete', { ...logContext, webhook, app: newApp });

  return {
    status: 200,
    body: {
      app: newApp.app,
      webhook: webhook.webhook,
    },
  };
};
