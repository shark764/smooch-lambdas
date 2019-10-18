/**
 * Lambda that deletes an smooch web integration
 **/

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const secretsClient = new AWS.SecretsManager();
const Joi = require('@hapi/joi');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const paramsSchema = Joi.object({
    'tenant-id': Joi.string()
        .required()
        .guid(),
    id: Joi.string()
        .required(),
});

exports.handler = async (event) => {
    console.log('delete-smooch-web-integration' , JSON.stringify(event));
    console.log('delete-smooch-web-integration' , JSON.stringify(process.env));

    const { AWS_REGION, ENVIRONMENT } = process.env;
    const { params } = event;

    try {
       await paramsSchema.validateAsync(params);
    } catch(error){
        console.error('Error: invalid params value ' + error.details[0].message);
        
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
    
    const { 'tenant-id': tenantId, id: integrationId } = params;
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
            body: { message: 'An Error has occurred trying to validate digital channels credentials' }
        };
    }

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
                status: 400,
                body: { message: `An Error has occurred trying to fetch an app for tenant ${tenantId} and integrationId ${integrationId}`, deleted: false}
            };
        }
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to fetch an app in DynamoDB for tenant ${tenantId} and integrationId ${integrationId}`, deleted: false, error}
        };
    }

    try {
        await smooch.integrations.delete(appId, integrationId);
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to delete an web integration for tenant ${tenantId} and integrationId ${integrationId}`, deleted: false, error }
        };
    }

    const deleteParams = {
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        Key: {
            'tenant-id': tenantId,
            id: integrationId,
        }
    };

    try {
        await docClient.delete(deleteParams).promise();
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to delete a record in DynamoDB for tenant ${tenantId} and integrationId ${integrationId}`, deleted: false, error}
        };
    }

    return {
        status: 200,
        body: { message: `The web integration with for tenant ${tenantId} and integrationId ${integrationId} has been deleted successfully`, deleted: true }
    };
   
};
