const SmoochCore = require('smooch-core');
const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const AWS = require('aws-sdk');
const FormData = require('form-data');

const secretsClient = new AWS.SecretsManager();
const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;

exports.handler = async (event) => {
  const {
    'tenant-id': tenantId,
    'interaction-id': interactionId,
    'interaction-metadata': metadata,
    event: incomingEvent,
  } = JSON.parse(event.Records[0].body);
  const { 'app-id': appId, 'user-id': userId } = metadata;
  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-event-end-interaction was called', { ...logContext, incomingEvent });

  // This can happen for old messaging interactions
  if (!appId) {
    log.info('smooch-event-end-interaction was called, but no appId. Ignoring.', logContext);
    return;
  }

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    log.error('An Error has occurred trying to retrieve cx credentials', logContext, error);
    throw error;
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);
  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    log.error('An Error has occurred trying to retrieve digital channels credentials', logContext, error);
    throw error;
  }

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
    log.error('An Error has occurred trying to initialize Smooch SDK', logContext, error);
    throw error;
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

    throw error;
  }

  const transcript = await formatMessages(messages, tenantId);
  await persistArchivedHistory('messaging-transcript', logContext, transcript, cxAuth);
};

async function persistArchivedHistory(type, logContext, transcript, cxAuth) {
  let artifact;
  try {
    const { data } = await createArtifact(logContext, type, cxAuth);
    log.debug('Created Artifact', { ...logContext, artifact: data });
    artifact = data;
  } catch (error) {
    log.error(
      'Error creating artifact',
      { ...logContext, transcript },
      error,
    );
    throw error;
  }

  const { artifactId } = artifact;
  let artifactFile;
  try {
    const { data } = await uploadArtifactFile(
      logContext, artifactId, transcript, cxAuth,
    );
    artifactFile = data;
  } catch (error) {
    log.error(
      'Error persisting artifact history', {
        ...logContext, artifactId, artifactFile,
      },
      error,
    );
    throw error;
  }

  log.info(
    'Successfully created messaging transcript artifact', {
      ...logContext, artifactId, artifactFile,
    },
  );
}

async function createArtifact({ tenantId, interactionId }, type, auth) {
  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts`,
    data: {
      artifactType: type,
    },
    auth,
  });
}

async function uploadArtifactFile({ tenantId, interactionId }, artifactId, transcript, auth) {
  const form = new FormData();
  form.append('content', Buffer.from(JSON.stringify(transcript)), {
    filename: 'transcript.json',
    contentType: 'application/json',
  });

  log.debug('Uploading artifact using old upload route', {
    tenantId, interactionId, artifactId, transcript,
  });
  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}`,
    data: form,
    auth,
    headers: form.getHeaders(),
  });
}

function formatMessages({ messages }, tenantId) {
  return messages
    .filter((message) => ((message.type === 'formResponse' && message.quotedMessage.content.metadata) || (message.role === 'appUser' && message.type !== 'formResponse') || message.metadata))
    .map((message) => ({
      payload: {
        metadata: {
          name: message.name || (message.metadata && message.metadata.from) || 'system',
          source: 'smooch',
          type: message.role === 'appMaker' ? message.metadata.type : 'customer',
          'first-name': (message.metadata && message.metadata.from
            && message.metadata.from.split(' ')[0])
            || (message.name && message.name.split(' ')[0])
            || 'system',
          'last-name': (message.metadata && message.metadata.from
            && message.metadata.from.split(' ')[1])
            || (message.name && message.name.split(' ')[1])
            || 'system',
        },
        body: {
          text: getMessageText(message),
        },
        from: (message.metadata && message.metadata.resourceId) || message.authorId,
        'tenant-id': tenantId,
        to: null, // channelId
        type: 'message',
        timestamp: `${(new Date(message.received * 1000)).toISOString().split('.').shift()}Z`,
      },
      channelId: null,
      timestamp: (message.received * 1000).toString(),
    }));
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
