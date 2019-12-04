/**
 * Lambda that sends system messages from flow
 */

const SmoochCore = require('smooch-core');
const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const AWS = require('aws-sdk');
const uuidv1 = require('uuid/v1');

// const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const auth = {
  username: 'titan-gateways@liveops.com',
  password: 'bCsW53mo45WWsuZ5',
};

const secretsClient = new AWS.SecretsManager();
const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;
const cxApiUrl = `https://${ENVIRONMENT}-api.${DOMAIN}`;

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
    // participants,
  } = body;

  const { 'app-id': appId, 'user-id': userId } = metadata;
  const { from, text } = parameters;
  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-action-send-message was called', { ...logContext, parameters: event.parameters, smoochApiUrl });

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

    return {
      status: 500,
      body: { message: errMsg },
    };
  }
  /* const errResponseUrl =
   `${cxApiUrl}/v1/tenants/${tenantId}/interactions/${interactionId}/
   actions/${id}/errors?id=${uuidv1()}`; */
  try {
    await smooch.appUsers.sendMessage({
      appId,
      userId,
      message: {
        text,
        role: 'appMaker',
        type: 'text',
        metadata: {
          type: 'system',
          from,
        },
      },
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to send smooch message to customer';
    log.warn(errMsg, logContext, error);
    /* try {
      await axios.post(errResponseUrl, { // send error response
        source: 'smooch',
        subId,
        errorMessage: errMsg,
        errorCode: 500,
        metadata: {},
        update: {},
      }, auth);
    } catch (error2) {
      log.warn('An Error ocurred trying to send an error response', logContext, error2);
    } */

    throw error;
  }

  /* smoochMessage = {
    id: smoochMessage._id,
    from,
    timestamp: smoochMessage.received * 1000,
    type: 'system',
    text,
  };

  try {
    participants.forEach(async (participant) => {
      await sendSqsMessage({
        tenantId,
        interactionId,
        resourceId: participant.resourceId,
        sessionId: participant.sessionId,
        messageType: 'received-message',
        message: smoochMessage,
        logContext,
      });
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to send message to SQS queue';
    log.error(errMsg, logContext, error);
    try {
      await axios.post(errResponseUrl, { // send error response
        source: 'smooch',
        subId,
        errorMessage: errMsg,
        errorCode: 500,
        metadata: {},
        update: {},
      }, auth);
    } catch (error2) {
      log.warn('An Error ocurred trying to send an error response', logContext, error2);
    }

    throw error;
  } */

  const actionResponseUrl = `${cxApiUrl}/v1/tenants/${tenantId}/interactions/${interactionId}/actions/${id}?id=${uuidv1()}`;

  try { // send action response
    await axios.post(actionResponseUrl, {
      source: 'smooch',
      subId,
      metadata: {},
      update: {},
    }, auth);
  } catch (error) {
    const errMsg = 'An Error has occurred trying to send action response';
    log.error(errMsg, logContext, error);
    throw error;
  }

  log.info('smooch-action-send-message was successful', logContext);
};

/* async function sendSqsMessage({
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
    type: 'smooch',
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
} */
