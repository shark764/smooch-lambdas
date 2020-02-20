/**
 * Lambda that deletes attachments from a Smooch user.
 */

const SmoochCore = require('smooch-core');
const log = require('serenova-js-utils/lambda/log');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();

const {
  AWS_REGION,
  ENVIRONMENT,
  smooch_api_url: smoochApiUrl,
} = process.env;

exports.handler = async (event) => {
  const {
    tenantId,
    interactionId,
    smoochAppId,
    smoochUserId,
    smoochMessageId,
  } = JSON.parse(event.Records[0].body);

  const logContext = {
    tenantId,
    interactionId,
    smoochAppId,
    smoochUserId,
  };

  log.info('delete-smooch-attachments was called', logContext);

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

  const appKeys = JSON.parse(appSecrets.SecretString);
  let smooch;

  try {
    smooch = new SmoochCore({
      keyId: appKeys[`${smoochAppId}-id`],
      secret: appKeys[`${smoochAppId}-secret`],
      scope: 'app',
      serviceUrl: smoochApiUrl,
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';
    log.error(errMsg, logContext, error);
    throw error;
  }

  let messages;

  try {
    messages = await smooch.appUsers.getMessages({
      smoochAppId,
      smoochUserId,
    });
  } catch (error) {
    const errMsg = 'An error occurred fetching interaction messages';
    log.error(errMsg, logContext, error);
    throw error;
  }
  log.debug('Got messages from Smooch', { ...logContext, smoochMessages: messages });

  const message = messages.messages
    .find((m) => m._id === smoochMessageId);

  if (message) {
    try {
      await smooch.attachments
        .delete({
          appId: smoochAppId,
          mediaUrl: message.mediaUrl,
        });
    } catch (error) {
      const errMsg = 'An Error has occurred trying to delete smooch attachment';
      log.error(errMsg, logContext, error);
      throw error;
    }
  } else {
    log.warn('Message not found', logContext);
  }

  log.info('delete-smooch-attachments complete', { ...logContext, messages });
};
