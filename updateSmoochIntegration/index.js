/**
 * Lambda that updates an smooch integration
 **/

const SmoochCore = require('smooch-core');

exports.handler = async (event) => {
    var smooch = new SmoochCore({
        keyId: 'act_5d0bde67cc95250010636aac',
        secret: 'eVgMHuwGm_ysETik3KiPNKFJ0XOG0wTVkepouUGJ2s_c721Nophtqu6Mf36bc1ffkl52OgmF93AJyysOLuVCwg',
        scope: 'account', // account, app, or appUser
    });

    const { appId, integrationId, props } = event;

    try {
        let webIntegration = await smooch.integrations.update({ appId, integrationId, props });
    
        return {
            statusCode: 200,
            body: { webIntegration }
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(error)
        };
    } 
};
