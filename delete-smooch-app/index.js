/**
 * Lambda that deletes an smooch app
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
    const { 'tenant-id': tenantId, id: appId } = event.params;
    const params = {
        TableName: 'us-east-1-dev-smooch',
        Key: {
            'tenant-id': tenantId,
            id: appId,
        }
    };

    console.log('delete-smooch-app' + JSON.stringify(event));
    console.log('delete-smooch-app' + JSON.stringify(process.env));

    try {
        await docClient.delete(params).promise();
    } catch (error) {
        console.error(JSON.stringify(error));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to delete a record in DynamoDB for tenant ${tenantId} and appId ${appId}`, deleted: false }
        };
    }

    try {
        await smooch.apps.delete(appId);
    } catch (error) {
        console.error(JSON.stringify(error));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to delete an app for tenant ${tenantId} and appId ${appId}`, deleted: false }
        };
    }

    return {
        status: 200,
        body: { message: `The app with for tenant ${tenantId} and appId ${appId} has been deleted successfully`, deleted: true }
    };
   
};
