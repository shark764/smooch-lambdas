/**
 * Lambda that sends messages
 */

const SmoochCore = require('smooch-core');
const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const AWS = require('aws-sdk');
const {
  checkIfClientIsDisconnected,
  shouldCheckIfClientIsDisconnected,
  getClientInactivityTimeout,
} = require('./resources/commonFunctions');

const secretsClient = new AWS.SecretsManager();
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const {
  REGION_PREFIX, ENVIRONMENT, DOMAIN, SMOOCH_API_URL,
} = process.env;

exports.handler = async (event) => {
  const { params, body, identity } = event;
  const { 'tenant-id': tenantId, 'interaction-id': interactionId } = params;
  const { 'user-id': resourceId, 'first-name': firstName, 'last-name': lastName } = identity;
  const from = `${firstName} ${lastName}`;
  const { agentMessageId, message } = body;
  const logContext = {
    tenantId,
    interactionId,
    resourceId,
  };

  log.info('send-message was called', {
    ...logContext,
    message,
    from,
    body,
  });

  let appSecrets;
  try {
    appSecrets = await secretsClient
      .getSecretValue({
        SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
      })
      .promise();
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
    cxAuthSecret = await secretsClient
      .getSecretValue({
        SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-cx`,
      })
      .promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);

  const appKeys = JSON.parse(appSecrets.SecretString);
  let interactionMetadata;
  try {
    const { data } = await getMetadata({ tenantId, interactionId, auth: cxAuth });

    log.debug('Got interaction metadata', { ...logContext, interaction: data });

    interactionMetadata = data;
    logContext.smoochIntegrationId = interactionMetadata.smoochIntegrationId;
  } catch (error) {
    const errMsg = 'An error occurred retrieving the interaction metadata';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const { appId, userId, source } = interactionMetadata;
  logContext.smoochAppId = appId;
  logContext.source = source;

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

  /**
   * If heartbeat is successful continue as normal
   * if not, return an error
   */
  try {
    await sendSmoochInteractionHeartbeat({
      tenantId,
      interactionId,
      auth: cxAuth,
    });
  } catch (error) {
    if (error.response.status === 404) {
      await smooch.appUsers.sendMessage({
        appId,
        userId,
        message: {
          text: `${firstName} Disconnected`,
          type: 'text',
          role: 'appMaker',
          metadata: {
            type: 'system',
            from,
            firstName,
            resourceId,
            interactionId,
          },
        },
      });

      const errMsg = 'Sending Message to dead interaction';

      log.error(errMsg, logContext, error);

      return {
        status: 410,
        body: { message: errMsg },
      };
    }
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
          firstName,
          resourceId,
          interactionId,
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

  // TODO: pass full message content when updating version from v1.1 to v2
  try {
    await axios({
      method: 'post',
      url: `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts`,
      data: {
        source: 'smooch',
        interruptType: 'message-sent',
        interrupt: {
          messageId: messageSent.message._id,
          messageContent: {
            type: messageSent.message.type,
            text: messageSent.message.text ? messageSent.message.text : '',
            mediaUrl: messageSent.message.mediaUrl ? messageSent.message.mediaUrl : '',
            mediaType: messageSent.message.mediaType ? messageSent.message.mediaType : '',
            altText: messageSent.message.altText ? messageSent.message.altText : '',
            mediaSize: messageSent.message.mediaSize ? messageSent.message.mediaSize : '',
          },
          from,
          resource: messageSent.message.metadata,
        },
      },
      auth: cxAuth,
    });
  } catch (err) {
    log.error('Error sending message-sent interrupt', logContext, err);
  }

  messageSent = {
    id: messageSent.message._id,
    text: messageSent.message.text,
    type: 'agent',
    from,
    agentMessageId,
    resourceId,
    timestamp: messageSent.message.received * 1000,
    contentType: messageSent.message.type,
    actions: messageSent.message.actions ? messageSent.message.actions : {},
    file: (messageSent.message.type !== 'text') ? {
      mediaUrl: messageSent.message.mediaUrl,
      mediaType: messageSent.message.mediaType,
    } : {},
  };

  log.info('Sent smooch message successfully', { ...logContext, smoochMessage: messageSent });

  const disconnectTimeoutInMinutes = await getClientInactivityTimeout({ logContext });
  let shouldCheck;
  if (disconnectTimeoutInMinutes) {
    log.debug('Disconnect Timeout is set. Checking if should check for client disconnect', {
      ...logContext,
      disconnectTimeoutInMinutes,
    });
    shouldCheck = await shouldCheckIfClientIsDisconnected({ userId, logContext });
  } else {
    log.debug('There is no Disconnect Timeout set. Not checking for client innactivity', logContext);
  }
  if (shouldCheck) {
    log.debug('Checking for client inactivity', { ...logContext, disconnectTimeoutInMinutes });
    await checkIfClientIsDisconnected({
      latestAgentMessageTimestamp: messageSent.timestamp,
      disconnectTimeoutInMinutes,
      userId,
      logContext,
    });
  }

  if (interactionMetadata.latestMessageSentBy !== 'agent') {
    interactionMetadata.latestMessageSentBy = 'agent';
    try {
      await updateInteractionMetadata({
        tenantId,
        interactionId,
        metadata: interactionMetadata,
      });
      log.info('Updated latestMessageSentBy flag from metadata', logContext);
    } catch (error) {
      log.fatal('Error updating latestMessageSentBy flag from metadata', logContext, error);
      throw error;
    }
  }

  try {
    await sendReportingEvent({ logContext });
  } catch (error) {
    log.error('Failed to send Reporting Event', logContext, error);
  }

  return {
    status: 200,
    body: { message: messageSent, interactionId },
  };
};

async function getMetadata({ tenantId, interactionId, auth }) {
  return axios({
    method: 'get',
    url: `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

async function updateInteractionMetadata({
  tenantId,
  interactionId,
  metadata,
}) {
  const QueueName = `${REGION_PREFIX}-${ENVIRONMENT}-update-interaction-metadata`;
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

async function sendReportingEvent({ logContext }) {
  const { tenantId, interactionId, resourceId } = logContext;
  const QueueName = `${REGION_PREFIX}-${ENVIRONMENT}-send-reporting-event`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    tenantId,
    interactionId,
    resourceId,
    topic: 'agent-message',
    appName: `${REGION_PREFIX}-${ENVIRONMENT}-send-message`,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };

  await sqs.sendMessage(sqsMessageAction).promise();
}

async function sendSmoochInteractionHeartbeat({ tenantId, interactionId, auth }) {
  const { data } = await axios({
    method: 'post',
    url: `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts`,
    data: {
      source: 'smooch',
      interruptType: 'smooch-heartbeat',
      interrupt: {},
    },
    auth,
  });

  log.debug('Interaction heartbeat', {
    interactionId,
    tenantId,
    request: data,
  });
  return data;
}
