/**
 * Lambda that sends messages
 */

const SmoochCore = require('smooch-core');
const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const AWS = require('aws-sdk');

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
    params,
    body,
    identity,
  } = event;
  const { 'tenant-id': tenantId, 'interaction-id': interactionId } = params;
  const { 'user-id': resourceId, 'first-name': firstName, 'last-name': lastName } = identity;
  const from = `${firstName} ${lastName}`;
  const {
    agentMessageId,
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
    body,
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

  const appKeys = JSON.parse(appSecrets.SecretString);
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
          firstName,
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
    agentMessageId,
    resourceId,
    timestamp: messageSent.message.received * 1000,
  };

  log.info('Sent smooch message successfully', { ...logContext, smoochMessage: messageSent });

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
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

async function sendReportingEvent({
  logContext,
}) {
  const { tenantId, interactionId, resourceId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-send-reporting-event`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    tenantId,
    interactionId,
    resourceId,
    topic: 'agent-message',
    appName: `${AWS_REGION}-${ENVIRONMENT}-send-message`,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };

  await sqs.sendMessage(sqsMessageAction).promise();
}
