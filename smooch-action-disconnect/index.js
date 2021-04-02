const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const { v1: uuidv1 } = require('uuid');
const AWS = require('aws-sdk');
const SmoochCore = require('smooch-core');

const secretsClient = new AWS.SecretsManager();
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const docClient = new AWS.DynamoDB.DocumentClient();

const {
  REGION_PREFIX,
  ENVIRONMENT,
  DOMAIN,
  SMOOCH_API_URL,
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
  const { 'app-id': appId, 'user-id': userId, 'artifact-id': artifactId } = metadata;

  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-action-disconnect was called', { ...logContext, artifactId, metadata });

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

  // Customer disconnect (has no resource attached to the disconnect signal)
  if (!parameters.resource || !parameters.resource.id) {
    log.info('Customer Disconnect', logContext);

    const smoochParams = {
      TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-interactions`,
      Key: {
        SmoochUserId: userId,
      },
      ConditionExpression: 'attribute_exists(SmoochUserId)',
    };
    try {
      await docClient.delete(smoochParams).promise();
    } catch (error) {
      log.info('An error occurred removing the interaction id on the state table. Assuming a previous disconnect has already done this.', logContext, error);
      await sendFlowActionResponse({
        logContext,
        actionId: id,
        subId,
        auth: cxAuth,
      });
      return;
    }
    log.debug('Removed interaction from state table', logContext);

    // Create Transcript
    await createMessagingTranscript({
      logContext,
      artifactId,
    });
    log.debug('Sent create transcript SQS event', logContext);

    try {
      await Promise.all(metadata.participants.map(async (participant) => {
        await smooch.appUsers.sendMessage({
          appId,
          userId,
          message: {
            text: `${participant['first-name']} disconnected.`,
            role: 'appMaker',
            type: 'text',
            metadata: {
              type: 'system',
              from: 'System',
              interactionId,
            },
          },
        });
        log.debug('Sent agent disconnected message', { ...logContext, participant });
      }));
    } catch (error) {
      log.error('An error occurred sending message to agents', logContext, error);
    }

    // Flow Action Response
    await sendFlowActionResponse({
      logContext,
      actionId: id,
      subId,
      auth: cxAuth,
    });

    log.info('smooch-action-disconnect was successful (Customer disconnect)', logContext);

    return;
  }

  const { id: resourceId } = parameters.resource;
  logContext.resourceId = resourceId;
  log.info('Resource disconnect - removing participant', logContext);

  // Setting LatestCustomerActivity to current date so it's the latest event
  // and customer does not get disconnected.
  await resetCustomerDisconnectTimer({ userId, logContext });

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
            from: 'System',
            interactionId,
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
      url: `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts?id=${uuidv1()}`,
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

  log.info('smooch-action-disconnect was successful (Agent disconnect)', logContext);
};

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

async function sendFlowActionResponse({ logContext, actionId, subId }) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${REGION_PREFIX}-${ENVIRONMENT}-send-flow-response`;
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

async function createMessagingTranscript({ logContext, artifactId }) {
  const {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  } = logContext;
  const QueueName = `${REGION_PREFIX}-${ENVIRONMENT}-create-messaging-transcript`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    tenantId,
    interactionId,
    artifactId,
    appId,
    userId,
  });

  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };

  await sqs.sendMessage(sqsMessageAction).promise();
}

async function resetCustomerDisconnectTimer({ userId, logContext }) {
  const params = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-interactions`,
    Key: {
      SmoochUserId: userId,
    },
    UpdateExpression: 'set LatestCustomerMessageTimestamp = :t',
    ExpressionAttributeValues: {
      ':t': (new Date()).getTime(),
    },
    ConditionExpression: 'attribute_exists(SmoochUserId) AND attribute_exists(InteractionId)',
    ReturnValues: 'UPDATED_NEW',
  };
  try {
    const data = await docClient.update(params).promise();
    log.debug('Updated lastCustomerMessageTimestamp', { ...logContext, updated: data });
  } catch (error) {
    log.error('An error ocurred reseting the customer disconnect timer. Interaction ID is no longer valid.', logContext, error);
  }
}
