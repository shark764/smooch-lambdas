const { lambda: { log } } = require('alonzo');
const AWS = require('aws-sdk');
const SmoochCore = require('smooch-core');

const secretsClient = new AWS.SecretsManager();
const docClient = new AWS.DynamoDB.DocumentClient();

const {
  REGION_PREFIX,
  ENVIRONMENT,
  SMOOCH_API_URL,
} = process.env;
const DEFAULT_CONVERSATION_RETENTION_SECONDS = 3600 * 48;

exports.handler = async () => {
  const accountSecrets = await secretsClient.getSecretValue({
    SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-account`,
  }).promise();
  const accountKeys = JSON.parse(accountSecrets.SecretString);
  const smooch = new SmoochCore({
    keyId: accountKeys.id,
    secret: accountKeys.secret,
    scope: 'account',
    serviceUrl: SMOOCH_API_URL,
  });

  const getRecordsParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
  };

  let smoochApps;

  try {
    const { Items } = await docClient.scan(getRecordsParams).promise();
    smoochApps = Items.filter((record) => record.type === 'app');
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch apps in DynamoDB';

    log.error(errMsg, {}, error);

    throw error;
  }

  log.debug('Starting app updates', { smoochApps });

  let hasErrored = false;
  for (const smoochApp of smoochApps) {
    const logContext = { smoochApp };
    const { id: appId } = smoochApp;
    try {
      await smooch.apps.update(appId, {
        settings: { conversationRetentionSeconds: DEFAULT_CONVERSATION_RETENTION_SECONDS },
      });
    } catch (error) {
      log.error('An error occurred updating smooch app', logContext, error);
      hasErrored = true;
    }
  }

  if (hasErrored) {
    throw new Error('At least one of the apps was unable to update. See logs for details.');
  }
};
