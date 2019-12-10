const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const uuidv1 = require('uuid/v1');
const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;

AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();

exports.handler = async (event) => {
  const {
    'tenant-id': tenantId,
    'interaction-id': interactionId,
    metadata,
    parameters,
    id: actionId,
    'sub-id': subId,
  } = JSON.parse(event.Records[0].body);

  const { 'app-id': appId, 'user-id': userId } = metadata;
  const { message, from } = parameters;
  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-action-collect-message-response was called', { ...logContext, parameters });

  if (!metadata['collect-actions']) {
    metadata['collect-actions'] = [];
  }
  const existingAction = metadata['collect-actions'].find(
    (action) => action['action-id'] === actionId,
  );

  if (existingAction) {
    log.warn('Actions already exists in pending interactions', { ...logContext, actionId });
    return;
  }

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);

  try {
    metadata['collect-actions'].push({ actionId, subId });
    const { data } = await updateMetadata({
      tenantId,
      interactionId,
      metadata,
      auth: cxAuth,
    });
    log.debug('Added collect-message action to interaction metadata', {
      ...logContext,
      metadata: data,
    });
  } catch (error) {
    log.error(
      'Error updating interaction metadata',
      logContext,
      error,
    );
    throw error;
  }

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    log.error('An Error has occurred trying to retrieve digital channels credentials', logContext, error);
    throw error;
  }

  const appKeys = JSON.parse(appSecrets.SecretString);
  let smooch;
  try {
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
      serviceUrl: smoochApiUrl,
    });
  } catch (error) {
    log.error('An Error has occurred trying to retrieve digital channels credentials', logContext, error);
    throw error;
  }

  try {
    await smooch.appUsers.sendMessage({
      appId,
      userId,
      message: {
        type: 'form',
        role: 'appMaker',
        fields: [{
          type: 'text',
          name: 'collect-message',
          label: message,
        }],
        blockChatInput: false,
        metadata: {
          subId,
          actionId,
          from,
        },
      },
    });
  } catch (error) {
    log.fatal('Error sending collect-message ', logContext, error);
    throw error;
  }

  log.info('smooch-action-collect-message-response was successful', logContext);
};

async function updateMetadata({
  tenantId, interactionId, metadata, auth,
}) {
  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata?id=${uuidv1()}`,
    data: {
      source: 'smooch',
      metadata,
    },
    auth,
  });
}
