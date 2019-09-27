/**
 * Lambda that creates a new smooch app
 **/

const SmoochCore = require('smooch-core');

exports.handler = async (event) => {
    var smooch = new SmoochCore({
        keyId: 'act_5d0bde67cc95250010636aac',
        secret: 'eVgMHuwGm_ysETik3KiPNKFJ0XOG0wTVkepouUGJ2s_c721Nophtqu6Mf36bc1ffkl52OgmF93AJyysOLuVCwg',
        scope: 'account', // account, app, or appUser
    });

    const { props } = event;
    const url = 'https://us-east-1-dev-smooch-gateway.cxengagelabs.net/webhook';

    try {
        let newApp = await smooch.apps.create({name: "TEST LAMBDA"});
        let webIntegration = await smooch.integrations.create({appId: newApp.app._id, props: props || {type: 'web'}});
        let webhooks = await smooch.webhooks.create(newApp.app._id, { target: url, triggers: ['*']});
    
        return {
            statusCode: 200,
            body: {
                    app: newApp.app, 
                    integration: webIntegration.integration, 
                    webhooks
                  }
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(error)
        };
    } 
};
