/**
 * Lambda that creates a new smooch app
 **/

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const smooch = new SmoochCore({
    keyId: 'act_5d0bde67cc95250010636aac',
    secret: 'eVgMHuwGm_ysETik3KiPNKFJ0XOG0wTVkepouUGJ2s_c721Nophtqu6Mf36bc1ffkl52OgmF93AJyysOLuVCwg',
    scope: 'account'
});

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    const { 'tenant-id': tenantId } = event.params;
    const webhookUrl = `https://${process.env.DOMAIN}-smooch-gateway.cxengagelabs.net/tenants/${tenantId}/smooch`;

    console.log('create-smooch-app' + JSON.stringify(event));
    console.log('create-smooch-app' + JSON.stringify(process.env));

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
        TableName: 'us-east-1-dev-smooch',
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
