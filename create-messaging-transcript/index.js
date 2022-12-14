const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();

const {
  REGION_PREFIX,
  ENVIRONMENT,
  DOMAIN,
  SMOOCH_API_URL,
} = process.env;

exports.handler = async (event) => {
  const {
    tenantId, interactionId, artifactId, appId, userId,
  } = JSON.parse(
    event.Records[0].body,
  );

  const logContext = {
    tenantId,
    interactionId,
    artifactId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('create-messaging-transcript was called', logContext);

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient
      .getSecretValue({
        SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-cx`,
      })
      .promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';
    log.error(errMsg, logContext, error);
    throw error;
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);

  let appSecrets;
  try {
    appSecrets = await secretsClient
      .getSecretValue({
        SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
      })
      .promise();
  } catch (error) {
    log.error(
      'An Error has occurred trying to retrieve digital channels credentials',
      logContext,
      error,
    );
    throw error;
  }

  const appKeys = JSON.parse(appSecrets.SecretString);
  let smooch;
  try {
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
      serviceUrl: SMOOCH_API_URL,
    });
  } catch (error) {
    log.error(
      'An Error has occurred trying to retrieve digital channels credentials',
      logContext,
      error,
    );
    throw error;
  }

  // All Messages
  let messages;
  // Used in loop to get previous messages
  let previousMessages;
  // Timestamp used for pagination of messages
  let previousTimestamp;
  try {
    messages = await smooch.appUsers.getMessages({
      appId,
      userId,
    });
  } catch (error) {
    log.error(
      'An error occurred fetching interaction messages',
      logContext,
      error,
    );
    throw error;
  }

  const { data: metadata } = await getMetadata({ tenantId, interactionId, auth: cxAuth });

  // Getting timestamp for pagination, previous messages
  // will be fetched if this value if not undefined.
  previousTimestamp = getPreviousTimestamp(messages);
  while (
    previousTimestamp !== null
    // We exclude previous messages from other intreactions
    && previousTimestamp >= metadata.firstCustomerMessageTimestamp
  ) {
    try {
      previousMessages = await smooch.appUsers.getMessages({
        appId,
        userId,
        query: {
          before: previousTimestamp,
        },
      });
    } catch (error) {
      log.error(
        'An error occurred fetching previous interaction messages',
        logContext,
        error,
      );
      throw error;
    }
    // Combining messages, previous messages are added
    // at the beginning of previous array.
    messages.messages.unshift(...previousMessages.messages);
    // Getting new timestamp for pagination, previous messages
    // will be fetched if this value if not undefined.
    previousTimestamp = getPreviousTimestamp(previousMessages);
  }
  // Transcript will have the total of messages
  const transcript = await formatMessages(messages, tenantId, metadata);

  await persistArchivedHistory(
    'messaging-transcript',
    logContext,
    transcript,
    cxAuth,
  );

  log.debug('Created messaging transcript', { ...logContext });
};

async function getMetadata({ tenantId, interactionId, auth }) {
  return axios({
    method: 'get',
    url: `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

function getPreviousTimestamp({ previous }) {
  try {
    const prev = new URL(previous);
    return prev.searchParams.get('before');
  } catch (error) {
    return null;
  }
}

async function persistArchivedHistory(type, logContext, transcript, cxAuth) {
  let artifactFile;
  try {
    const { data } = await exports.uploadArtifactFile(
      logContext,
      transcript,
      cxAuth,
    );
    artifactFile = data;
  } catch (error) {
    log.error(
      'Error persisting artifact history',
      {
        ...logContext,
        artifactFile,
      },
      error,
    );
    throw error;
  }

  log.info('Successfully created messaging transcript artifact', {
    ...logContext,
    artifactFile,
  });
}

async function uploadArtifactFile(
  { tenantId, interactionId, artifactId },
  transcript,
  auth,
) {
  const form = new FormData();
  form.append('content', Buffer.from(JSON.stringify(transcript)), {
    filename: 'transcript.json',
    contentType: 'application/json',
  });

  form.append('content.metadata', JSON.stringify({ transcript: true }));

  log.debug('Uploading artifact using old upload route', {
    tenantId,
    interactionId,
    artifactId,
    transcript,
  });
  return axios({
    method: 'post',
    url: `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}`,
    data: form,
    auth,
    headers: form.getHeaders(),
  });
}

function formatTextFallBack(text) {
  const responses = text.split('\n').map((message) => {
    const messageArray = message.split(':');
    return {
      name: messageArray[0],
      text: messageArray[1],
    };
  });
  return {
    responses,
  };
}

function getMessageText(message) {
  if (message.role === 'appMaker' && message.type === 'form') {
    if (message.fields[0].name === 'collect-message') {
      return message.fields[0].label;
    }
    return message.blockChatInput ? 'Multi-field form sent. Customer chat input blocked until form is submitted.' : 'Multi-field form sent.';
  }

  if (message.type === 'formResponse') {
    return message.fields[0].name === 'collect-message' ? message.fields[0].text : JSON.stringify(formatTextFallBack(message.textFallback));
  }

  return message.text; // normal messages
}

function formatMessages(
  { messages },
  tenantId,
  { customer, firstCustomerMessageTimestamp, source },
) {
  return messages
    .filter(
      (message) => ((message.type === 'formResponse'
          && message.quotedMessage.content.metadata)
          || (message.role === 'appUser' && message.type !== 'formResponse')
          || (message.metadata
            && (source !== 'web'
              || (source === 'web'
                && message.metadata.from !== 'CxEngageHiddenMessage'))))
        // We double check we filter previous messages in case
        // they were included in last iteration
        && message.received >= firstCustomerMessageTimestamp,
    )
    .map((message) => ({
      payload: {
        metadata: {
          name:
            message.role === 'appMaker'
              ? message.name
                || (message.metadata && message.metadata.from)
                || 'system'
              : customer,
          source: 'smooch',
          type: message.role === 'appMaker' ? message.metadata.type : 'customer',
        },
        body: {
          id: message._id,
          text: getMessageText(message),
          contentType: message.type,
          file: {
            mediaUrl: message.mediaUrl,
            mediaType: message.mediaType,
            mediaSize: message.mediaSize,
          },
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
          actions: message.actions ? message.actions : {},
        },
        from: (message.metadata && message.metadata.resourceId) || message.authorId,
        'tenant-id': tenantId,
        to: null, // channelId
        type: 'message',
        timestamp: `${new Date(message.received * 1000)
          .toISOString()
          .split('.')
          .shift()}Z`,
      },
      channelId: null,
      timestamp: (message.received * 1000).toString(),
    }));
}

exports.uploadArtifactFile = uploadArtifactFile;
