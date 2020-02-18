/**
 * Lambda that sends attachments to customer
 */

const SmoochCore = require('smooch-core');
const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const docClient = new AWS.DynamoDB.DocumentClient();

const s3 = new AWS.S3();

const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;

exports.handler = async (event) => {
  const { params, 'multipart-params': multipartParams, identity } = event;
  const { 'tenant-id': tenantId, 'interaction-id': interactionId } = params;
  const {
    'user-id': resourceId,
    'first-name': firstName,
    'last-name': lastName,
  } = identity;
  const from = `${firstName} ${lastName}`;

  const logContext = {
    tenantId,
    interactionId,
    resourceId,
  };

  log.info('send-attachment was called', {
    ...logContext,
    from,
    smoochApiUrl,
    multipartParams,
  });

  let appSecrets;
  try {
    appSecrets = await secretsClient
      .getSecretValue({
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
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
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
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
    const { data } = await getMetadata({
      tenantId,
      interactionId,
      auth: cxAuth,
    });

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

  const { appId, userId, artifactId } = interactionMetadata;
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

  /**
   * Send file to customer
   */
  const multipart = Object.keys(multipartParams)[0];
  const {
    'content-type': contentType,
    'aws-bucket': awsBucket,
    'aws-key': awsKey,
    filename,
  } = multipartParams[multipart];

  let s3Stream;
  let awsFile;
  try {
    s3Stream = await retrieveObject({
      awsBucket,
      awsKey,
    });
    awsFile = generateFormDataFromStream({
      s3Stream,
      filename,
      contentType,
    });
  } catch (error) {
    const errMsg = 'Could not retrieve file from S3';
    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  let fileSent;
  try {
    fileSent = await smooch.attachments.create({
      appId,
      props: {
        for: 'message',
        access: 'public',
        appUserId: userId,
      },
      source: awsFile,
    });
  } catch (error) {
    const errMsg = 'Could not send file to customer';
    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  let messageSent;
  let filetype;
  const { mediaUrl, mediaType } = fileSent;
  if (mediaType.startsWith('image/')) {
    filetype = 'image';
  } else {
    filetype = 'file';
  }
  try {
    messageSent = await smooch.appUsers.sendMessage({
      appId,
      userId,
      message: {
        text: filename,
        type: filetype,
        mediaUrl,
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

  const attachmentSent = {
    id: messageSent.message._id,
    text: messageSent.message.text,
    type: 'agent',
    from,
    resourceId,
    fileSent,
    messageSent,
    timestamp: messageSent.message.received * 1000,
  };

  log.info('Sent smooch attachment successfully', {
    ...logContext,
    smoochMessage: attachmentSent,
  });

  try {
    await uploadArtifactFile(
      logContext,
      artifactId,
      { s3Stream, filename, contentType },
      attachmentSent,
      cxAuth,
    );
  } catch (error) {
    log.error('Error uploading file to artifact', logContext, error);
  }

  /**
   * Check for client activity
   */
  const disconnectTimeoutInMinutes = await getClientInactivityTimeout({
    logContext,
  });
  let shouldCheck;
  if (disconnectTimeoutInMinutes) {
    log.debug(
      'Disconnect Timeout is set. Checking if should check for client disconnect',
      { ...logContext, disconnectTimeoutInMinutes },
    );
    shouldCheck = await shouldCheckIfClientIsDisconnected({
      userId,
      logContext,
    });
  } else {
    log.debug(
      'There is no Disconnect Timeout set. Not checking for client innactivity',
      logContext,
    );
  }
  if (shouldCheck) {
    log.debug('Checking for client inactivity', {
      ...logContext,
      disconnectTimeoutInMinutes,
    });
    await checkIfClientIsDisconnected({
      latestAgentMessageTimestamp: attachmentSent.timestamp,
      disconnectTimeoutInMinutes,
      userId,
      logContext,
    });
  }

  try {
    await sendReportingEvent({ logContext });
  } catch (error) {
    log.error('Failed to send Reporting Event', logContext, error);
  }

  return {
    status: 200,
    body: { message: attachmentSent, interactionId },
  };
};

async function getMetadata({ tenantId, interactionId, auth }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

async function sendReportingEvent({ logContext }) {
  const { tenantId, interactionId, resourceId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-send-reporting-event`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    tenantId,
    interactionId,
    resourceId,
    topic: 'agent-message',
    appName: `${AWS_REGION}-${ENVIRONMENT}-send-attachment`,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };

  await sqs.sendMessage(sqsMessageAction).promise();
}

async function retrieveObject({ awsBucket, awsKey }) {
  const params = {
    Bucket: awsBucket,
    Key: awsKey,
  };

  const s3Stream = await s3.getObject(params).promise();
  return s3Stream.Body;
}

function generateFormDataFromStream({ s3Stream, filename, contentType }) {
  const formData = new FormData();
  formData.append('source', s3Stream, {
    filename,
    contentType,
  });

  return formData;
}

async function uploadArtifactFile(
  { tenantId, interactionId },
  artifactId,
  { s3Stream, filename, contentType },
  attachment,
  auth,
) {
  const form = new FormData();
  form.append('content', s3Stream, {
    filename,
    contentType,
  });
  form.append('content.metadata', JSON.stringify({ messageId: attachment.id }));

  log.debug('Uploading artifact using old upload route', {
    tenantId,
    interactionId,
    artifactId,
    smoochFileMessage: attachment,
  });
  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}`,
    data: form,
    auth,
    headers: form.getHeaders(),
  });
}

async function checkIfClientIsDisconnected({
  latestAgentMessageTimestamp,
  disconnectTimeoutInMinutes,
  userId,
  logContext,
}) {
  const { tenantId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-smooch-client-disconnect-checker`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const DelaySeconds = Math.min(disconnectTimeoutInMinutes, 15) * 60;
  const MessageBody = JSON.stringify({
    tenantId,
    userId,
    latestAgentMessageTimestamp,
    disconnectTimeoutInMinutes,
  });
  const sqsMessageAction = {
    MessageBody,
    QueueUrl,
    DelaySeconds,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
}

async function shouldCheckIfClientIsDisconnected({ userId, logContext }) {
  let smoochInteractionRecord;
  try {
    smoochInteractionRecord = await docClient
      .get({
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
        Key: {
          SmoochUserId: userId,
        },
      })
      .promise();
  } catch (error) {
    log.error('Failed to get smooch interaction record', logContext, error);
    throw error;
  }

  const interactionItem = smoochInteractionRecord && smoochInteractionRecord.Item;
  const hasInteractionItem = interactionItem && Object.entries(interactionItem).length !== 0;
  const LatestCustomerMessageTimestamp = interactionItem
    && interactionItem.LatestCustomerMessageTimestamp;
  const LatestAgentMessageTimestamp = interactionItem
    && interactionItem.LatestAgentMessageTimestamp;

  if (!hasInteractionItem) {
    return false;
  }
  // No customer messages, or no agent messages. Check if client is active
  if (!LatestCustomerMessageTimestamp || !LatestAgentMessageTimestamp) {
    return true;
  }
  if (LatestCustomerMessageTimestamp > LatestAgentMessageTimestamp) {
    return true;
  }
  return false;
}

async function getClientInactivityTimeout({ logContext }) {
  const { tenantId, smoochIntegrationId: integrationId } = logContext;
  let smoochIntegration;
  try {
    smoochIntegration = await docClient
      .get({
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        Key: {
          'tenant-id': tenantId,
          id: integrationId,
        },
      })
      .promise();
  } catch (error) {
    log.error('Failed to get smooch interaction record', logContext, error);
    throw error;
  }
  const {
    Item: { 'client-disconnect-minutes': clientDisconnectMinutes },
  } = smoochIntegration;

  return clientDisconnectMinutes;
}
