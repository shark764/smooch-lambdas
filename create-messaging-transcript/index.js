const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();

const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
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
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
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
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
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
      serviceUrl: smoochApiUrl,
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

  // Getting timestamp for pagination, previous messages
  // will be fetched if this value if not undefined.
  previousTimestamp = getPreviousTimestamp(messages);
  while (previousTimestamp !== null) {
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
  const transcript = await formatMessages(messages, tenantId);

  await persistArchivedHistory(
    'messaging-transcript',
    logContext,
    transcript,
    cxAuth,
  );

  log.debug('Created messaging transcript', { ...logContext });
};

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
    const { data } = await uploadArtifactFile(
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

  log.debug('Uploading artifact using old upload route', {
    tenantId,
    interactionId,
    artifactId,
    transcript,
  });
  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}`,
    data: form,
    auth,
    headers: form.getHeaders(),
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

function formatMessages({ messages }, tenantId) {
  return messages
    .filter(
      (message) => (message.type === 'formResponse'
          && message.quotedMessage.content.metadata)
        || (message.role === 'appUser' && message.type !== 'formResponse')
        || message.metadata,
    )
    .map((message) => ({
      payload: {
        metadata: {
          name:
            message.name
            || (message.metadata && message.metadata.from)
            || 'system',
          source: 'smooch',
          type:
            message.role === 'appMaker' ? message.metadata.type : 'customer',
          'first-name':
            (message.metadata
              && message.metadata.from
              && message.metadata.from.split(' ')[0])
            || (message.name && message.name.split(' ')[0])
            || 'System',
          'last-name':
            (message.metadata
              && message.metadata.from
              && message.metadata.from.split(' ')[1])
            || (message.name && message.name.split(' ')[1])
            || 'System',
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
        },
        from:
          (message.metadata && message.metadata.resourceId) || message.authorId,
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
