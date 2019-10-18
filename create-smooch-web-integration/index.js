/**
 * Lambda that creates an smooch web integration
 **/

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const smooch = new SmoochCore({
    keyId: 'act_5da0b5671c42610010a7f245',
    secret: '6-cyVcqWS185_zvDFGITUPAz1gM1IggG286IKSoEQFZNuDRonU7SZDOv3wOWiFzeMLUUQOijZXeD2BxGY7hhFw',
    scope: 'account'
});
const Joi = require('@hapi/joi');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const bodySchema = Joi.object({
    appId: Joi.string()
        .required(),
    prechatCapture: Joi.string()
        .required()
        .valid('name', 'email'),

    name: Joi.string()
        .required(),

    description: Joi.string(),

    brandColor: Joi.string(),

    originWhiteList: Joi.array()
        .items(Joi.string()),

    businessName: Joi.string(),

    businessIconUrl: Joi.string(),

    fixedIntroPane: Joi.boolean(),

    conversationColor: Joi.string(),

    backgroundImageUrl: Joi.string(),

    actionColor: Joi.string(),

    displayStyle: Joi.string()
        .valid('button', 'tab'),

    buttonWidth: Joi.string(),

    buttonHeight: Joi.string(),

    buttonIconUrl: Joi.string()
});
const paramsSchema = Joi.object({
    'tenant-id': Joi.string().guid(),
    'user-id': Joi.any(),
    'remote-addr': Joi.any(),
});

exports.handler = async (event) => {
    console.log('create-smooch-web-integration' , JSON.stringify(event));
    console.log('create-smooch-web-integration' , JSON.stringify(process.env));

    const { body, params, identity } = event;
    try {
        await bodySchema.validateAsync(body);
    } catch (error) {
        console.warn('Error: invalid body value ' + error.details[0].message);

        return {
            status: 400,
            body: { message: 'Error: invalid body value ' + error.details[0].message}
        };
    }

    try {
       await paramsSchema.validateAsync(params);
    } catch(error){
        console.warn('Error: invalid params value ' + error.details[0].message);
        
        return {
            status: 400,
            body: { message: 'Error: invalid params value ' + error.details[0].message}
        };
    }

    const { 'tenant-id': tenantId } = params;
    const { appId } = body;
    let defaultPrechatCapture;

    if (body.prechatCapture === 'name') {
        defaultPrechatCapture = [{
            type: 'text',
            name: 'name',
            label: 'Name',
            placeholder: '',
            minSize: 1,
            maxSize: 128,
        }];
    } else if (body.prechatCapture === 'email') {
        defaultPrechatCapture = [{
            type: 'email',
            name: 'email',
            label: 'Email',
            placeholder: '',
            minSize: 1,
            maxSize: 128,
        }];
    } else {
        return {
            status: 400,
            body: { message: `Bad request: body.prechatCapture invalid value ${body.prechatCapture}` }
        }
    }

    let integration;
    try {
        integration = await smooch.integrations.create({
            appId,
            props: {
                type: 'web',
                brandColor: body.brandColor,
                originWhiteList: body.originWhiteList,
                businessName: body.businessName,
                businessIconUrl: body.businessIconUrl,
                fixedIntroPane: body.fixedIntroPane,
                integrationOrder: [],
                prechatCapture: { enabled: true, fields: defaultPrechatCapture },
                conversationColor: body.conversationColor,
                backgroundImageUrl: body.backgroundImageUrl,
                actionColor: body.actionColor,
                displayStyle: body.displayStyle,
                buttonWidth: body.buttonWidth,
                buttonHeight: body.buttonHeight,
                buttonIconUrl: body.buttonIconUrl
            }
        });

    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to create a web integration for tenant ${tenantId}`, error }
        };
    }

    const createParams = {
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        Item: {
            'tenant-id': tenantId,
            id: integration.integration._id,
            'app-id': appId,
            type: 'web',
            name: body.name,
            description: body.description,
            'created-by': identity['user-id'],
            'updated-by': identity['user-id'],
            created: (new Date()).toISOString(),
            updated: (new Date()).toISOString()
        }
    };
    try {
        await docClient.put(createParams).promise();
    } catch (error) {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return {
            status: 500,
            body: { message: `An Error has occurred trying to save a record in DynamoDB for tenant ${tenantId}`, error }
        };
    }

   return {
        status: 201,
        body: { integration }
    };
};
