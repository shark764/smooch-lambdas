/**
 * Lambda that rotates smooch app keys (for security https://media.tenor.com/images/b932f15ba124ceab6614c0ba716ec8d2/tenor.gif)
 **/

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

exports.handler = async (event) => {
    console.log('rotate-smooch-app-keys ', JSON.stringify(event));
    console.log('rotate-smooch-app-keys ', JSON.stringify(process.env));

    const { AWS_REGION, ENVIRONMENT } = process.env;

    const params = {
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        IndexName: 'TypeIndex',
        KeyConditionExpression: "type = :v1",
        ExpressionAttributeValues: {
            ":v1": {
                S: "app"
            }
        }
    };

    const appsResult = await docClient.query(params).promise();

    console.log('appsResult ', JSON.stringify(appsResult));

    const appSecretName = `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`;

    for (const app of appsResult.Items) {
        try {
            const { id: appId, 'tenant-id': tenantId } = app;
            const appSecrets = await secretsClient.getSecretValue({
                SecretId: appSecretName
            }).promise();
            const appKeys = JSON.parse(appSecrets.SecretString);
            const smooch = new SmoochCore({
                keyId: appKeys[`${tenantId}-id`],
                secret: appKeys[`${tenantId}-secret`],
                scope: 'app'
            });
            const { key: newSmoochAppKeys } = await smooch.apps.keys.create(appId, tenantId);
            await smooch.apps.keys.delete(appId, appKeys[`${tenantId}-id-old`]);
            appKeys[`${tenantId}-id-old`] = appKeys[`${tenantId}-id`];
            appKeys[`${tenantId}-secret-old`] = appKeys[`${tenantId}-secret`]
            appKeys[`${tenantId}-id`] = newSmoochAppKeys._id;
            appKeys[`${tenantId}-secret`] = newSmoochAppKeys.secret;
            await secretsClient.putSecretValue({
                SecretId: appSecretName,
                SecretString: JSON.stringify(appKeys)
            }).promise();
        } catch (error) {
            console.error(`An error occurred trying to update app credentials for tenant ${tenantId} app ${id} `, JSON.stringify(error));
        }
    };

};
