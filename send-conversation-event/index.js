/**
 * Lambda that sends typing and read indicators
 */

const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();
const auth = {
  username: 'titan-gateways@liveops.com',
  password: 'bCsW53mo45WWsuZ5',
};
const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;


exports.handler = async (event) => {
  const { params, identity } = event;
  const { 'tenant-id': tenantId, 'interaction-id': interactionId, event: userEvent } = params;
  const { 'user-id': resourceId, name: from } = identity;
  const logContext = {
    tenantId,
    interactionId,
    resourceId,
    indicator: userEvent,
  };

  log.info('send-conversation-event was called', {
    ...logContext,
    userEvent,
    from,
    params,
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

  const { 'app-id': appId, 'user-id': smoochUserId } = interactionMetadata;
  logContext.smoochAppId = appId;
  logContext.smoochUserId = smoochUserId;

  let smooch;
  try {
    const appKeys = JSON.parse(appSecrets.SecretString);
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to validate digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }
  let smoochEvent = null;
  const body = {
    resourceId,
  };
  switch (userEvent) {
    case 'conversation-read':
      smoochEvent = 'conversation:read';
      body.event = userEvent;
      break;
    case 'typing-start':
      smoochEvent = 'typing:start';
      body.isTyping = true;
      break;
    case 'typing-stop':
      smoochEvent = 'typing:stop';
      body.isTyping = false;
      break;
    default:
      log.warn('the provided event is not supported', logContext);
      return {
        status: 400,
        body: { message: 'the provided event is not supported' },
      };
  }

  try {
    smooch.appUsers.conversationActivity({
      appId,
      smoochUserId,
      activityProps: {
        role: 'appMaker',
        type: smoochEvent,
      },
    });
  } catch (error) {
    const errMsg = 'An error occurred trying to send conversation activity';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }


  log.info('send-conversation-event successfully', logContext);

  return {
    status: 200,
    body,
  };
};

async function getMetadata({ tenantId, interactionId }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}`,
    auth,
  });
}
