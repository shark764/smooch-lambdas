/**
 * Lambda that rotates smooch app keys (for security https://media.tenor.com/images/b932f15ba124ceab6614c0ba716ec8d2/tenor.gif)
 * */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

exports.handler = async (event) => {
  console.log('rotate-smooch-app-keys ', JSON.stringify(event));
  console.log('rotate-smooch-app-keys ', JSON.stringify(process.env));

  const { AWS_REGION, ENVIRONMENT } = process.env;

  const accountSecrets = await secretsClient.getSecretValue({
    SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/account`,
  }).promise();
  const accountKeys = JSON.parse(accountSecrets.SecretString);
  const smooch = new SmoochCore({
    keyId: accountKeys.id,
    secret: accountKeys.secret,
    scope: 'account',
  });

  const params = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    IndexName: 'type-index', // TODO: unnecessary index now. All app ids are available in secret keys.
    KeyConditionExpression: '#type = :type',
    ExpressionAttributeNames: {
      '#type': 'type',
    },
    ExpressionAttributeValues: {
      ':type': 'app',
    },
  };

  const appsResult = await docClient.query(params).promise();

  const appSecretName = `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`;

  let hasErrored = false;
  for (const app of appsResult.Items) { // eslint-disable-line no-restricted-syntax
    const { id: appId, 'tenant-id': tenantId } = app;
    try {
      const appSecrets = await secretsClient.getSecretValue({
        SecretId: appSecretName,
      }).promise();
      const appKeys = JSON.parse(appSecrets.SecretString);
      const { key: newSmoochAppKeys } = await smooch.apps.keys.create(appId, tenantId);
      if (appKeys[`${tenantId}-id-old`]) {
        await smooch.apps.keys.delete(appId, appKeys[`${tenantId}-id-old`]);
      } else {
        console.log(`App does not have old appKeys. tenant ${tenantId} app ${appId}`);
      }
      appKeys[`${tenantId}-id-old`] = appKeys[`${tenantId}-id`];
      appKeys[`${tenantId}-secret-old`] = appKeys[`${tenantId}-secret`];
      appKeys[`${tenantId}-id`] = newSmoochAppKeys._id;
      appKeys[`${tenantId}-secret`] = newSmoochAppKeys.secret;
      await secretsClient.putSecretValue({
        SecretId: appSecretName,
        SecretString: JSON.stringify(appKeys),
      }).promise();
    } catch (error) {
      hasErrored = true;
      console.error(`An error occurred trying to update app credentials for tenant ${tenantId} app ${appId} `, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }
  }

  if (hasErrored) {
    throw new Error('At least one of the apps was unable to rotate app keys. See logs for details.');
  }
};
