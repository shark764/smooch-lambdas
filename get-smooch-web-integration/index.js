/**
 * Lambda that gets a web integration from Smooch
 **/

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const secretsClient = new AWS.SecretsManager();
const Joi = require('@hapi/joi');
const paramsSchema = Joi.object({
    'tenant-id': Joi.string().guid().required(),
    'id': Joi.string().required(),
    'user-id': Joi.any(),
    'remote-addr': Joi.any(),
});
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

exports.handler = async (event) => {
    console.log('get-smooch-web-integration' , JSON.stringify(event));
    console.log('get-smooch-web-integration' , JSON.stringify(process.env));
    
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

    const { 'tenant-id': tenantId, id: integrationId } = params;
    const queryParams = {
       Key: {
        'tenant-id': {
          S: tenantId
         }, 
        'id': {
          S: integrationId
       }, 
       TableName:  `${AWS_REGION}-${ENVIRONMENT}-smooch`
      }
   }
    let appId;

    try {
       const queryResponse = await ddb.getItem(queryParams).promise();
        if(queryResponse.Item){
            appId = queryResponse.Item['app-id'];
        } else {
            console.error(`An Error has occurred trying to fetch an app for tenant ${tenantId} and integrationId ${integrationId}`);
            
            return {
                status: 500,
                body: { message: `An Error has occurred trying to fetch an app for tenant ${tenantId} and integrationId ${integrationId}`}
            };
        }
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to fetch an app in DynamoDB for tenant ${tenantId} and integrationId ${integrationId}`}
        };
    }
    
    let smoochIntegration;
    
    try {
        smoochIntegration = smooch.integrations.get(appId, integrationId);
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to delete an web integration for tenant ${tenantId} and integrationId ${integrationId}`}
        };
    }

    return {
        status: 200,
        body: smoochIntegration
    };

};
