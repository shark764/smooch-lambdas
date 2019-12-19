/**
 * Lambda that sends typing and read indicators
 */

const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();
const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;

exports.handler = async (event) => {
  const { params, identity, body } = event;
  const { 'tenant-id': tenantId, 'interaction-id': interactionId } = params;
  const { 'user-id': resourceId, name: from } = identity;
  const { event: userEvent } = body;
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

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);

  let interactionMetadata;
  try {
    const { data } = await getMetadata({ tenantId, interactionId, auth: cxAuth });

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

  const { appId, userId: smoochUserId } = interactionMetadata;
  logContext.smoochAppId = appId;
  logContext.smoochUserId = smoochUserId;

  let smooch;
  try {
    const appKeys = JSON.parse(appSecrets.SecretString);
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
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
  let smoochEvent = null;
  const bodyResult = {
    resourceId,
  };
  switch (userEvent) {
    case 'conversation-read':
      smoochEvent = 'conversation:read';
      bodyResult.event = userEvent;
      break;
    case 'typing-start':
      smoochEvent = 'typing:start';
      bodyResult.isTyping = true;
      break;
    case 'typing-stop':
      smoochEvent = 'typing:stop';
      bodyResult.isTyping = false;
      break;
    default:
      log.warn('the provided event is not supported', logContext);
      return {
        status: 400,
        body: { message: 'the provided event is not supported' },
      };
  }

  try {
    await smooch.appUsers.conversationActivity({
      appId,
      userId: smoochUserId,
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
    body: bodyResult,
  };
};

async function getMetadata({ tenantId, interactionId, auth }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}
