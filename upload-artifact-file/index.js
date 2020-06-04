/**
 * Lambda that uploads an artifact file
 */

const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const AWS = require('aws-sdk');
const FormData = require('form-data');

AWS.config.update({ region: process.env.AWS_REGION });
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
