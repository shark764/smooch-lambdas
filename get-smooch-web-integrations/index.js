/**
 * Lambda that gets a web integration from Smooch
 **/

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const paramsSchema = Joi.object({
    'tenant-id': Joi.string().guid().required(),
    'user-id': Joi.any(),
    'remote-addr': Joi.any(),
    'auth': Joi.any()
});
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    console.log('get-smooch-web-integrations' , JSON.stringify(event));
    console.log('get-smooch-web-integrations' , JSON.stringify(process.env));
    
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
     
    const { 'tenant-id': tenantId } = params;
    
    const queryParams = {
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        KeyConditionExpression: '#tenantId = :t, #integrationType = :type',
        IndexName: 'TenantIdTypeIndex',
        ExpressionAttributeNames:{
            '#tenantId': 'tenant-id',
            '#integrationType': 'type'
        },
        ExpressionAttributeValues: {
            ':t': tenantId,
            ':type': 'web',
        }
    };
    let smoochIntegrations;

    try {
        const queryResponse = await docClient.query(queryParams).promise();
        smoochIntegrations = queryResponse.Items;
     } catch (error) {
         console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
 
         return {
             status: 500,
             body: { message: `An Error has occurred trying to fetch integrations in DynamoDB for tenant ${tenantId}`}
         };
     }
    
   
    return {
        status: 200,
        body: smoochIntegrations
    };

};