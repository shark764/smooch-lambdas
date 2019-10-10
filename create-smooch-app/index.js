/**
 * Lambda that creates a new smooch app
 **/

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

exports.handler = async (event) => {
    console.log('create-smooch-app' + JSON.stringify(event));
    console.log('create-smooch-app' + JSON.stringify(process.env));

    const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;
    const { 'tenant-id': tenantId } = event.params;

    const webhookUrl = `https://${AWS_REGION}-${ENVIRONMENT}-smooch-gateway.${DOMAIN}/tenants/${tenantId}/smooch`;

    let secrets;
    try {
        secrets = await secretsClient.getSecretValue({
            SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/account`
        }).promise();
    } catch (error) {
        console.error(JSON.stringify(error));
        return {
            statusCode: 500,
            body: { message: 'An Error has occurred trying to retrieve digital channels credentials' }
        };
    }
    
    // XXX just for testing/debugging. remove when we can see it.
    console.log('~~!!~~', typeof secrets, secrets);

    let smooch;
    try {
        const keys = JSON.parse(secrets.SecretString);
        // XXX just for testing/debugging. remove when we can see it.
        console.log('~~!!~~2', keys['platform-key-id'], keys['platform-secret']);
        smooch = new SmoochCore({
            keyId: keys['platform-key-id'],
            secret: keys['platform-secret'],
            scope: 'account'
        });
    } catch (error) {
        console.error(JSON.stringify(error))
        return {
            statusCode: 500,
            body: { message: `An Error has occurred trying to validate digital channels credentials` }
        };
    }

    let newApp;
    try {
        newApp = await smooch.apps.create({ name: tenantId });
    } catch (error) {
        console.error(JSON.stringify(error));
        return {
            statusCode: 500,
            body: { message: `An Error has occurred trying to create an App for tenant ${tenantId}` }
        };
    }

    let webhook;
    try {
        webhook = await smooch.webhooks.create(newApp.app._id, { target: webhookUrl, triggers: ['*', 'typing:appUser'], includeClient: true });
    } catch (error) {
        console.error(JSON.stringify(error));
        return {
            statusCode: 500,
            body: { message: `An Error has occurred trying to create webhooks for tenant ${tenantId}` }
        };
    }

    const params = {
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        Item: {
            'tenant-id': tenantId,
            id: newApp.app._id,
            type: 'app',
            'webhook-id': webhook.webhook._id
        }
    };

    try {
       await docClient.put(params).promise();
    } catch (error) {
        console.error(JSON.stringify(error));
        return {
            statusCode: 500,
            body: { message: `An Error has occurred trying to save a record in DynamoDB for tenant ${tenantId}` }
        };
    }

    return {
        statusCode: 200,
        body: {
            app: newApp.app,
            webhook
        }
    };
};
