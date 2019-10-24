/**
 * Lambda that creates a new smooch app
 **/

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const axios = require ('axios');

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

const paramsSchema = Joi.object({
    'tenant-id': Joi.string().guid(),
    'user-id': Joi.any(),
    'remote-addr': Joi.any(),
    'auth': Joi.any()
});

exports.handler = async (event) => {
    console.log('create-smooch-app ', JSON.stringify(event));
    console.log('create-smooch-app ', JSON.stringify(process.env));

    const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;
    const { params, identity } = event;

    try {
        await paramsSchema.validateAsync(params);
     } catch(error){
         console.error('Error: invalid params value ' + error.details[0].message);
         
         return {
             status: 400,
             body: { message: 'Error: invalid params value ' + error.details[0].message}
         };
     }

     const apiUrl = `https://${ENVIRONMENT}-api.${DOMAIN}/v1/tenants/${tenantId}`;
     const { 'tenant-id': tenantId, auth } = params;
     try {
        const response = await axios.get(apiUrl, {headers: {Authorization: auth}});
        if(!(response && response.data && response.data.result && response.data.result.active)){
            console.warn(`Error tenant not found or inactive ${tenantId}`);
            
            return {
                status: 400,
                body: { message:`Error tenant not found or inactive ${tenantId}` }
            }
        } 
     } catch(error) {
        console.error(`Unexpected error occurred retrieving tenant ${tenantId}`);

        return {
            status: error.response.status === 404 ? 400 : 500,
            body: { message: error.response.status === 404 ? `Tenant ${tenantId} not found` : `Unexpected error occurred retrieving tenant ${tenantId}` }
        }
     }

    let accountSecrets;
    
    try {
        accountSecrets = await secretsClient.getSecretValue({
            SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/account`
        }).promise();
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return {
            status: 500,
            body: { message: 'An Error has occurred trying to retrieve digital channels credentials' }
        };
    }
    
    let smooch;
    try {
        const accountKeys = JSON.parse(accountSecrets.SecretString);
        smooch = new SmoochCore({
            keyId: accountKeys['id'],
            secret: accountKeys['secret'],
            scope: 'account'
        });
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return {
            status: 500,
            body: { message: `An Error has occurred trying to validate digital channels credentials` }
        };
    }

    let newApp;
    try {
        newApp = await smooch.apps.create({ name: tenantId });
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return {
            status: 500,
            body: { message: `An Error has occurred trying to create an App for tenant ${tenantId}` }
        };
    }

    let smoochAppKeys;
    try {
        smoochAppKeys = await smooch.apps.keys.create(newApp.app._id, tenantId);
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return {
            status: 500,
            body: { message: `An Error has occurred trying to create App credentials for tenant ${tenantId}` }
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
            body: { message: `An Error has occurred (1) trying to save App credentials for ${tenantId}` }
        };
    }

    const appKeys = JSON.parse(appSecrets.SecretString);
    appKeys[`${tenantId}-id`] = smoochAppKeys.key._id;
    appKeys[`${tenantId}-secret`] = smoochAppKeys.key.secret;

    try {
        await secretsClient.putSecretValue({
            SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`,
            SecretString: JSON.stringify(appKeys)
        }).promise();
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return {
            status: 500,
            body: { message: `An Error has occurred (2) trying to save App credentials for ${tenantId}` }
        };
    }

    const webhookUrl = `https://${AWS_REGION}-${ENVIRONMENT}-smooch-gateway.${DOMAIN}/tenants/${tenantId}/smooch`;
    let webhook;
    try {
        webhook = await smooch.webhooks.create(newApp.app._id, { target: webhookUrl, triggers: ['*', 'typing:appUser'], includeClient: true });
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return {
            status: 500,
            body: { message: `An Error has occurred trying to create webhooks for tenant ${tenantId}` }
        };
    }

    const params = {
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        Item: {
            'tenant-id': tenantId,
            id: newApp.app._id,
            type: 'app',
            'webhook-id': webhook.webhook._id,
            'created-by': identity['user-id'],
            'updated-by': identity['user-id'],
            created: (new Date()).toISOString(),
            updated: (new Date()).toISOString()
        }
    };

    try {
       await docClient.put(params).promise();
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return {
            status: 500,
            body: { message: `An Error has occurred trying to save a record in DynamoDB for tenant ${tenantId}` }
        };
    }

    return {
        status: 200,
        body: {
            app: newApp.app,
            webhook
        }
    };
};
