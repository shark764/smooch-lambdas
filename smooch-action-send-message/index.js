/**
 * Lambda that sends system messages from flow
 */

const SmoochCore = require('smooch-core');
const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const AWS = require('aws-sdk');
const uuidv1 = require('uuid/v1');
const { getMetadata } = require('./resources/commonFunctions');

const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const secretsClient = new AWS.SecretsManager();
const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;
const cxApiUrl = `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}`;

exports.handler = async (event) => {
  let {
    body,
  } = event.Records[0];

  body = JSON.parse(body);

  const {
    id,
    'tenant-id': tenantId,
    'sub-id': subId,
    'interaction-id': interactionId,
    metadata,
    parameters,
  } = body;

  const { 'app-id': appId, 'user-id': userId, participants } = metadata;
  const { from, text } = parameters;
  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-action-send-message was called', { ...logContext, parameters: event.parameters, smoochApiUrl });

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);
  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';
    log.error(errMsg, logContext, error);
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
    const errMsg = 'An Error has occurred trying to validate digital channels credentials';

    log.error(errMsg, logContext, error);

    throw error;
  }
  const errResponseUrl = `${cxApiUrl}/v1/tenants/${tenantId}/interactions/${interactionId}`;
  let smoochMessage;
  try {
    smoochMessage = await smooch.appUsers.sendMessage({
      appId,
      userId,
      message: {
        text,
        role: 'appMaker',
        type: 'text',
        metadata: {
          type: 'system',
          from,
          interactionId,
        },
      },
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to send smooch message to customer';
    log.warn(errMsg, logContext, error);
    try {
      await axios({
        method: 'post',
        url: errResponseUrl,
        data: { // send error response
          source: 'smooch',
          subId,
          errorMessage: errMsg,
          errorCode: 500,
          metadata: {},
          update: {},
        },
        auth: cxAuth,
      });
    } catch (error2) {
      log.warn('An Error ocurred trying to send an error response', logContext, error2);
    }

    throw error;
  }

  let interactionMetadata;
  try {
    ({ data: interactionMetadata } = await getMetadata({
      tenantId,
      interactionId,
      auth: cxAuth,
    }));

    log.debug('Got interaction metadata', {
      ...logContext,
      interaction: interactionMetadata,
    });
  } catch (error) {
    log.error('An error occurred retrieving the interaction metadata', logContext, error);

    throw error;
  }

  smoochMessage = {
    id: smoochMessage._id,
    from,
    timestamp: smoochMessage.received * 1000,
    type: 'system',
    text,
  };

  if (
    interactionMetadata.source !== 'web'
    || (interactionMetadata.source === 'web' && from !== 'CxEngageHiddenMessage')
  ) {
    try {
      participants.forEach(async (participant) => {
        await sendSqsMessage({
          tenantId,
          interactionId,
          resourceId: participant['resource-id'],
          sessionId: participant['session-id'],
          messageType: 'received-message',
          message: smoochMessage,
          logContext,
        });
      });
    } catch (error) {
      const errMsg = 'An Error has occurred trying to send message to SQS queue';
      log.error(errMsg, logContext, error);
      try {
        await axios({
          method: 'post',
          url: errResponseUrl,
          data: {
            // send error response
            source: 'smooch',
            subId,
            errorMessage: errMsg,
            errorCode: 500,
            metadata: {},
            update: {},
          },
          auth: cxAuth,
        });
      } catch (error2) {
        log.warn(
          'An Error ocurred trying to send an error response',
          logContext,
          error2,
        );
      }
      throw error;
    }
  } else {
    log.info(
      'Skipping hidden message sent to participants',
      logContext,
      smoochMessage,
      participants,
    );
  }

  await sendFlowActionResponse({ logContext, actionId: id, subId });
};

async function sendFlowActionResponse({
  logContext, actionId, subId,
}) {
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

async function sendSqsMessage({
  interactionId,
  tenantId,
  sessionId,
  resourceId,
  logContext,
  messageType,
  message,
}) {
  const parameters = {
    resourceId,
    sessionId,
    tenantId,
    interactionId,
    messageType,
    message,
  };
  const action = JSON.stringify({
    tenantId,
    interactionId,
    actionId: uuidv1(),
    subId: uuidv1(),
    type: 'send-message',
    ...parameters,
  });
  const QueueName = `${tenantId}_${resourceId}`;
  let queueUrl;

  try {
    const { QueueUrl } = sqs.getQueueUrl({ QueueName }).promise();
    queueUrl = QueueUrl;
  } catch (error) {
    log.error('An error occured trying to get queue url', logContext, error);
    throw error;
  }

  if (!queueUrl) {
    try {
      const createQueueParams = {
        QueueName,
      };
      const { QueueUrl } = await sqs.createQueue(createQueueParams).promise();
      queueUrl = QueueUrl;
    } catch (error) {
      log.error('An error occured trying to create queue', logContext, error);
      throw error;
    }
  }

  const sendSQSParams = {
    MessageBody: action,
    QueueUrl: queueUrl,
  };

  await sqs.sendMessage(sendSQSParams).promise();
}
