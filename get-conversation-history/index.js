/**
 * Lambda that retrieve conversation history from an interaction
 */

const SmoochCore = require('smooch-core');
const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();
const {
  REGION_PREFIX,
  ENVIRONMENT,
  DOMAIN,
  SMOOCH_API_URL,
} = process.env;

exports.handler = async (event) => {
  const { params } = event;
  const { 'tenant-id': tenantId, 'interaction-id': interactionId } = params;
  const logContext = { tenantId, interactionId };

  log.info('get-conversation-history was called', { ...logContext, params });

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
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

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-cx`,
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

  const {
    appId, userId, customer, source,
  } = interactionMetadata;
  logContext.smoochAppId = appId;
  logContext.smoochUserId = userId;

  let smooch;
  try {
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
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

  let messages;

  try {
    messages = await smooch.appUsers.getMessages({
      appId,
      userId,
    });
  } catch (error) {
    const errMsg = 'An error occurred fetching interaction messages';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }
  log.debug('Got messages from Smooch', { ...logContext, smoochMessages: messages });

  messages = messages.messages
    // Keep formResponses that have metadata (collect-message responses)
    // Keep messages from customer that are not form response (normal customer messages)
    // Keep messages with metadata (agent or system messages)
    .filter(
      (message) => (message.type === 'formResponse'
          && message.quotedMessage.content.metadata)
        || (message.role === 'appUser' && message.type !== 'formResponse')
        || (message.metadata
          && (source !== 'web'
            || (source === 'web'
              && message.metadata.from !== 'CxEngageHiddenMessage'))),
    )
    .map((message) => ({
      id: message._id,
      text: getMessageText(message),
      quotedMessage: message.quotedMessage ? {
        content: message.quotedMessage.content ? {
          id: message.quotedMessage.content._id,
          type: message.quotedMessage.content.type,
          text: message.quotedMessage.content.text,
          file: (message.quotedMessage.content.type !== 'text') ? {
            mediaUrl: message.quotedMessage.content.mediaUrl,
            mediaType: message.quotedMessage.content.mediaType,
            mediaSize: message.quotedMessage.content.mediaSize,
          } : {},
        } : {},
      } : {},
      type: message.role === 'appMaker' ? message.metadata.type : 'customer',
      from: message.role === 'appMaker' ? message.metadata.from : customer,
      file: {
        mediaUrl: message.mediaUrl,
        mediaType: message.mediaType,
        mediaSize: message.mediaSize,
      },
      contentType: message.type,
      resourceId: message.role === 'appMaker' ? message.metadata.resourceId : null,
      timestamp: message.received * 1000,
    }));

  log.info('get-conversation-history complete', { ...logContext, messages });

  return {
    status: 200,
    body: { messages, interactionId },
  };
};

async function getMetadata({ tenantId, interactionId, auth }) {
  return axios({
    method: 'get',
    url: `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

function getMessageText(message) {
  if (message.role === 'appMaker' && message.type === 'form') {
    return message.fields[0].label; // collect-message
  }

  if (message.type === 'formResponse') {
    return message.fields[0].text; // collect-message response
  }

  return message.text; // normal messages
}
