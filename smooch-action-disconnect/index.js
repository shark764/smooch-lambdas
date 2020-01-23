const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const uuidv1 = require('uuid/v1');
const AWS = require('aws-sdk');
const SmoochCore = require('smooch-core');

AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;

exports.handler = async (event) => {
  const {
    id,
    'tenant-id': tenantId,
    'sub-id': subId,
    'interaction-id': interactionId,
    metadata,
    parameters,
  } = JSON.parse(event.Records[0].body);
  const { 'app-id': appId, 'user-id': userId } = metadata;

  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-action-disconnect was called', { ...logContext });

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

  // Customer disconnect (has no resource attached to the disconnect signal)
  if (!parameters.resource || !parameters.resource.id) {
    log.info('Customer Disconnect - removing all participants', logContext);

    try {
      metadata.participants.forEach(async (participant) => {
        await smooch.appUsers.sendMessage({
          appId,
          userId,
          message: {
            text: `${participant['first-name']} disconnected.`,
            role: 'appMaker',
            type: 'text',
            metadata: {
              type: 'system',
              from: 'system',
            },
          },
        });
      });
    } catch (error) {
      log.error('An error occurred sending message', logContext, error);
      throw error;
    }

    metadata.participants = [];
    try {
      await updateInteractionMetadata({ tenantId, interactionId, metadata });
    } catch (error) {
      log.error('Error updating interaction metadata', logContext, error);
      throw error;
    }
    log.debug('Removed all participants from interaction metadata', {
      ...logContext,
      metadata,
    });

    // This can happen for old messaging interactions
    if (!appId) {
      log.info(
        'smooch-event-end-interaction was called, but no appId. Ignoring.',
        logContext,
      );
      return;
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
    await sendFlowActionResponse({
      logContext,
      actionId: id,
      subId,
      auth: cxAuth,
    });

    return;
  }

  const { id: resourceId } = parameters.resource;
  logContext.resourceId = resourceId;

  log.info('Resource disconnect - removing participant', logContext);

  const { participants } = metadata;
  const removedParticipant = participants.find(
    (participant) => participant['resource-id'] === resourceId,
  );
  const updatedParticipants = participants.filter(
    (participant) => participant['resource-id'] !== resourceId,
  );

  if (participants.length === updatedParticipants.length) {
    log.warn('Participant does not exist', {
      ...logContext,
      participants,
      resourceId,
    });
  } else {
    try {
      metadata.participants = updatedParticipants;
      await updateInteractionMetadata({ tenantId, interactionId, metadata });
      log.debug('Removed participant from interaction metadata', {
        ...logContext,
        metadata,
      });
    } catch (error) {
      log.error('Error updating interaction metadata', logContext, error);
      throw error;
    }

    try {
      await smooch.appUsers.sendMessage({
        appId,
        userId,
        message: {
          text: `${removedParticipant['first-name']} disconnected.`,
          role: 'appMaker',
          type: 'text',
          metadata: {
            type: 'system',
            from: 'system',
          },
        },
      });
    } catch (error) {
      log.error('An error occurred sending message', logContext, error);
      throw error;
    }
  }

  // Flow Action Response
  await sendFlowActionResponse({
    logContext,
    actionId: id,
    subId,
    auth: cxAuth,
  });

  // Perform Resource Interrupt
  try {
    await axios({
      method: 'post',
      url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts?id=${uuidv1()}`,
      data: {
        source: 'smooch',
        interruptType: 'resource-disconnect',
        interrupt: {
          resourceId,
        },
      },
      auth: cxAuth,
    });
  } catch (error) {
    log.error(
      'An Error has occurred trying to send resource interrupt',
      logContext,
      error,
    );
    throw error;
  }

  log.info('smooch-action-disconnect was successful', logContext);
};

async function updateInteractionMetadata({
  tenantId,
  interactionId,
  metadata,
}) {
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-update-interaction-metadata`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    tenantId,
    interactionId,
    source: 'smooch',
    metadata,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
}

async function sendFlowActionResponse({ logContext, actionId, subId }) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-send-flow-response`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const data = {
    source: 'smooch',
    subId,
    metadata: {},
    update: {},
  };
  const payload = JSON.stringify({
    tenantId,
    actionId,
    interactionId,
    data,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
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
  let artifact;
  try {
    const { data } = await createArtifact(logContext, type, cxAuth);
    log.debug('Created Artifact', { ...logContext, artifact: data });
    artifact = data;
  } catch (error) {
    log.error('Error creating artifact', { ...logContext, transcript }, error);
    throw error;
  }

  const { artifactId } = artifact;
  let artifactFile;
  try {
    const { data } = await uploadArtifactFile(
      logContext,
      artifactId,
      transcript,
      cxAuth,
    );
    artifactFile = data;
  } catch (error) {
    log.error(
      'Error persisting artifact history',
      {
        ...logContext,
        artifactId,
        artifactFile,
      },
      error,
    );
    throw error;
  }

  log.info('Successfully created messaging transcript artifact', {
    ...logContext,
    artifactId,
    artifactFile,
  });
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

async function uploadArtifactFile(
  { tenantId, interactionId },
  artifactId,
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
            || 'system',
          'last-name':
            (message.metadata
              && message.metadata.from
              && message.metadata.from.split(' ')[1])
            || (message.name && message.name.split(' ')[1])
            || 'system',
        },
        body: {
          text: getMessageText(message),
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
