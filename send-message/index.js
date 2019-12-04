/**
 * Lambda that sends messages
 */

const SmoochCore = require('smooch-core');
const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();
const auth = {
  username: 'titan-gateways@liveops.com',
  password: 'bCsW53mo45WWsuZ5',
};
const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;


exports.handler = async (event) => {
  const {
    params,
    body,
    identity,
  } = event;
  const { 'tenant-id': tenantId, 'interaction-id': interactionId } = params;
  const { 'user-id': resourceId, 'first-name': firstName, 'last-name': lastName } = identity;
  const from = `${firstName} ${lastName}`;
  const {
    message,
  } = body;
  const logContext = {
    tenantId,
    interactionId,
    resourceId,
  };

  log.info('send-message was called', {
    ...logContext,
    message,
    from,
    smoochApiUrl,
  });

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const appKeys = JSON.parse(appSecrets.SecretString);
  let interactionMetadata;
  try {
    const { data } = await getMetadata({ tenantId, interactionId });

    log.debug('Got interaction metadata', { ...logContext, interaction: data });

    interactionMetadata = data;
  } catch (error) {
    const errMsg = 'An error occurred retrieving the interaction metadata';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const { appId, userId } = interactionMetadata;
  logContext.smoochAppId = appId;

  let smooch;
  try {
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
      serviceUrl: smoochApiUrl,
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';
    log.error(errMsg, logContext, error);
    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  let messageSent;
  try {
    messageSent = await smooch.appUsers.sendMessage({
      appId,
      userId,
      message: {
        text: message,
        type: 'text',
        role: 'appMaker',
        metadata: {
          type: 'agent',
          from,
          resourceId,
        },
      },
    });
  } catch (error) {
    const errMsg = 'An error occurred sending message';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  messageSent = {
    id: messageSent.message._id,
    text: messageSent.message.text,
    type: 'agent',
    from,
    resourceId,
    timestamp: messageSent.message.received * 1000,
  };

  log.info('Sent smooch message successfully', { ...logContext, smoochMessage: messageSent });

  return {
    status: 200,
    body: { message: messageSent, interactionId },
  };
};

async function getMetadata({ tenantId, interactionId }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}
