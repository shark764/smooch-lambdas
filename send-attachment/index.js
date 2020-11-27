/**
 * Lambda that sends attachments to customer
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
const MAX_FILE_SIZE = 26214400;

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

  const {
    appId, userId, artifactId, source,
  } = interactionMetadata;
  logContext.smoochAppId = appId;
  logContext.source = source;

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
   * If heartbeat is successfull continue as normal
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

      const errMsg = 'Sending Attachment to dead interaction';

      log.error(errMsg, logContext, error);

      return {
        status: 410,
        body: { message: errMsg },
      };
    }
  }

  /**
   * Send file to customer
   */
  const multipart = Object.keys(multipartParams)[0];
  const { agentMessageId } = multipartParams;
  const {
    'content-type': contentType,
    'aws-bucket': awsBucket,
    'aws-key': awsKey,
    filename,
  } = multipartParams[multipart];

  let s3Stream;
  let awsFile;
  try {
    const fileSize = await sizeOf(awsKey, awsBucket);
    if (fileSize > MAX_FILE_SIZE) {
      const errMsg = 'File is too large';
      log.warn(errMsg, { ...logContext, fileSize });

      return {
        status: 413,
        body: { message: errMsg },
      };
    }
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
    let errMsg;

    if (error.response && error.response.statusText && error.response.status) {
      if (error.response.status === 413) {
        errMsg = 'File is too large';
      } else {
        errMsg = error.response.statusText;
      }
    } else {
      errMsg = 'Could not send file to customer';
    }

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
        type: filetype,
        mediaUrl,
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
    const errMsg = error.response && error.response.statusText
      ? error.response.statusText
      : 'An error occurred sending message';

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
    contentType: messageSent.message.type,
    file: {
      mediaType,
      mediaUrl,
    },
    from,
    agentMessageId,
    resourceId,
    timestamp: messageSent.message.received * 1000,
  };

  log.info('Sent smooch attachment successfully', {
    ...logContext,
    smoochMessage: messageSent,
  });
  try {
    await uploadArtifactFile(
      logContext,
      artifactId,
      { filename, contentType },
      messageSent,
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
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

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
  {
    tenantId,
    interactionId,
  },
  artifactId,
  { filename, contentType },
  message,
) {
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-upload-artifact-file`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    source: 'agent',
    tenantId,
    interactionId,
    artifactId,
    fileData: { filename, contentType },
    message,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };

  return sqs.sendMessage(sqsMessageAction).promise();
}

async function sizeOf(key, bucket) {
  const { ContentLength } = await s3.headObject({ Key: key, Bucket: bucket }).promise();

  return ContentLength;
}

async function sendSmoochInteractionHeartbeat({ tenantId, interactionId, auth }) {
  const { data } = await axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts`,
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
