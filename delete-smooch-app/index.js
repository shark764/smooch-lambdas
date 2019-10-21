/**
 * Lambda that deletes an smooch app
 **/

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const secretsClient = new AWS.SecretsManager();
const Joi = require('@hapi/joi');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const paramsSchema = Joi.object({
    'tenant-id': Joi.string().guid().required(),
    'id': Joi.string().required(),
    'user-id': Joi.any(),
    'remote-addr': Joi.any(),
    'auth': Joi.any()
});

exports.handler = async (event) => {
    console.log('delete-smooch-app' + JSON.stringify(event));
    console.log('delete-smooch-app' + JSON.stringify(process.env));

    const { AWS_REGION, ENVIRONMENT } = process.env;
    const { params } = event;

    try {
        await paramsSchema.validateAsync(params);
    } catch(error) {
         console.warn('Error: invalid params value ' + error.details[0].message);
         
         return {
             status: 400,
             body: { message: 'Error: invalid params value ' + error.details[0].message}
         };
     }
    
    let appSecrets;

    try {
        appSecrets = await secretsClient.getSecretValue({
            SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`
        }).promise();
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        return {
            status: 500,
            body: { message: 'An Error has occurred trying to retrieve digital channels credentials' }
        };
    }

    const { 'tenant-id': tenantId, id: appId } = params;
    let smooch;

    try {
        const appKeys = JSON.parse(appSecrets.SecretString);
        smooch = new SmoochCore({
            keyId: appKeys[`${tenantId}-id`],
            secret: appKeys[`${tenantId}-secret`],
            scope: 'app'
        });
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        return {
            status: 500,
            body: { message: `An Error has occurred trying to validate digital channels credentials` }
        };
    }
    
    const deleteParams = {
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        Key: {
            'tenant-id': tenantId,
            id: appId,
        }
    };

    try {
        await docClient.delete(deleteParams).promise();
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to delete a record in DynamoDB for tenant ${tenantId} and appId ${appId}`, deleted: false }
        };
    }

    try {
        await smooch.apps.delete(appId);
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

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
