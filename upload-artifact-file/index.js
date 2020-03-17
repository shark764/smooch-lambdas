/**
 * Lambda that uploads an artifact file
 */

const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const AWS = require('aws-sdk');
const FormData = require('form-data');

AWS.config.update({ region: process.env.AWS_REGION });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const secretsClient = new AWS.SecretsManager();

const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
} = process.env;

exports.handler = async (event) => {
  const {
    source,
    tenantId,
    interactionId,
    artifactId,
    fileData,
    message,
    smoochAppId,
    smoochUserId,
  } = JSON.parse(event.Records[0].body);
  const logContext = {
    tenantId,
    interactionId,
    artifactId,
    smoochMessage: message,
  };

  log.info('upload-artifact-file was called', { ...logContext, artifactId });
  const { filename, contentType } = fileData;

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

  let fileStream;
  try {
    const { data } = await axios({
      method: 'get',
      url: message.mediaUrl || message.file.mediaUrl,
      responseType: 'arraybuffer',
    });
    log.trace('Got file from source', {
      tenantId,
      interactionId,
      message,
      source,
    });

    fileStream = data;
  } catch (error) {
    const errMsg = 'An error ocurred retrieving attachment';

    log.error(errMsg, {
      tenantId,
      interactionId,
      artifactId,
      smoochFileMessage: message,
    });

    throw error;
  }

  const form = new FormData();
  form.append('content', Buffer.from(fileStream), {
    filename,
    contentType,
  });
  form.append('content.metadata', JSON.stringify({ messageId: message._id || message.id }));

  log.debug('Scheduling Smooch Attachment deletion', {
    tenantId,
    interactionId,
    artifactId,
    smoochFileMessage: message,
  });
  await scheduleSmoochAttachmentDeletion({
    tenantId, interactionId, smoochMessageId: message._id, smoochAppId, smoochUserId,
  });

  log.debug('Uploading artifact using old upload route', {
    tenantId,
    interactionId,
    artifactId,
    smoochFileMessage: message,
  });

  try {
    await axios({
      method: 'post',
      url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}`,
      data: form,
      auth: cxAuth,
      headers: form.getHeaders(),
    });
  } catch (err) {
    log.error('Error uploading file to artifact', logContext, err);

    throw err;
  }

  log.info('upload-artifact-file was successful', logContext);
};

async function scheduleSmoochAttachmentDeletion({
  tenantId, interactionId, smoochMessageId, smoochUserId, smoochAppId,
}) {
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-schedule-lambda-trigger`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const MessageBody = JSON.stringify({
    tenantId,
    interactionId,
    ruleName: `DeleteSmoochAttachment-${smoochMessageId}`,
    triggerInMs: 43200000, // 12 hours
    targetQueueName: `${AWS_REGION}-${ENVIRONMENT}-delete-smooch-attachments`,
    additionalParams: {
      smoochAppId,
      smoochUserId,
      smoochMessageId,
    },
  });
  const sqsMessageAction = {
    MessageBody,
    QueueUrl,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
}
