/**
 * Lambda that deletes an smooch app
 **/

const SmoochCore = require('smooch-core');

exports.handler = async (event) => {
    var smooch = new SmoochCore({
        keyId: 'act_5d0bde67cc95250010636aac',
        secret: 'eVgMHuwGm_ysETik3KiPNKFJ0XOG0wTVkepouUGJ2s_c721Nophtqu6Mf36bc1ffkl52OgmF93AJyysOLuVCwg',
        scope: 'account', // account, app, or appUser
    });

    const { appId } = event;

    try {
        let app = await smooch.apps.delete(appId);
    
        return {
            statusCode: 200,
            body: { appId, deleted: true }
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: {...error, deleted: false}
        };
    } 
};
